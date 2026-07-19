import axios from "axios";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { IPv4, newWithBuffer, type Searcher } from "ip2region.js";

// IP geolocation for the analytics pipeline.
//
// Provider chain (first meaningful result wins):
//   1. ip2region 离线库 — bundled xdb file, no network at all. The primary
//      source: it is the only option that correctly locates Chinese carrier
//      NAT egress IPs (e.g. a China Mobile user in Chengdu shows 四川省成都市,
//      while ip-api.com says Guangzhou and even the Amap API returns empty).
//      Also immune to the fact that domestic lookup endpoints are
//      unreachable from Vercel's overseas nodes.
//   2. 高德 IP 定位 — only when AMAP_IP_GEO_KEY is configured.
//   3. whois.pconline — free domestic API; effectively unreachable from
//      Vercel, kept as a last-ditch attempt.
//   4. ip-api.com — overseas fallback with proxy/hosting flags.
//
// Trade-off: when the offline DB answers an overseas IP we skip ip-api.com
// and lose its proxy/hosting flags; VPN detection then relies on the
// timezone cross-check (isTimezoneMismatch), which covers this site's main
// case (China-based visitors tunneling out).

interface IpGeoResult {
  region: string;
  city: string;
  // ISO 3166-1 alpha-2, when known. Domestic providers always mean "CN".
  countryCode?: string;
  // Only populated by ip-api.com (proxy = VPN/proxy/Tor, hosting = datacenter).
  proxy?: boolean;
  hosting?: boolean;
}

const cache = new Map<string, IpGeoResult>();

function cacheResult(ip: string, result: IpGeoResult): IpGeoResult {
  cache.set(ip, result);
  if (cache.size > 1000) {
    const keys = Array.from(cache.keys());
    for (let i = 0; i < 500; i++) {
      cache.delete(keys[i]);
    }
  }
  return result;
}

function isPrivateIp(ip: string): boolean {
  return (
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^(fc|fd)/i.test(ip)
  );
}

// --- ip2region 离线库（零网络） -------------------------------------------------
// Data: server/_core/data/ip2region_v4.xdb (~11MB, Apache-2.0/MIT, from
// github.com/lionsoul2014/ip2region). Re-download the file to refresh data.

let ip2regionSearcher: Searcher | null | undefined; // undefined = not tried yet

function getIp2regionSearcher(): Searcher | null {
  if (ip2regionSearcher !== undefined) return ip2regionSearcher;
  const candidates: Array<string | URL> = [
    // Local dev / bundled server: project root is the cwd.
    path.join(process.cwd(), "server", "_core", "data", "ip2region_v4.xdb"),
    // Vercel nft asset tracing keys off this import.meta.url pattern.
    new URL("./data/ip2region_v4.xdb", import.meta.url),
  ];
  for (const candidate of candidates) {
    try {
      const buffer = fs.readFileSync(candidate);
      ip2regionSearcher = newWithBuffer(IPv4, buffer);
      return ip2regionSearcher;
    } catch {
      // try the next candidate path
    }
  }
  console.warn("[IP Geo] ip2region xdb not found; offline lookup disabled");
  ip2regionSearcher = null;
  return null;
}

// Test hook: force the offline searcher on (undefined = lazy-load) or off (null).
export function __setIp2regionSearcherForTests(searcher: Searcher | null | undefined): void {
  ip2regionSearcher = searcher;
}

// Region string from the v3 binding: "国家|省|市|ISP|国家代码", "0" = unknown.
// Domestic: 中国|四川省|成都市|移动|CN → { 四川省, 成都市 }.
export function parseIp2region(raw: string): IpGeoResult | null {
  const parts = raw.split("|");
  if (parts.length < 5) return null;
  const [country, province, city, , countryCode] = parts;
  if (province && province !== "0") {
    return {
      region: province,
      city: city && city !== "0" ? city : "",
      countryCode: countryCode && countryCode !== "0" ? countryCode : undefined,
    };
  }
  if (country && country !== "0") {
    return { region: country, city: "", countryCode: countryCode && countryCode !== "0" ? countryCode : undefined };
  }
  return null;
}

async function lookupIp2region(ip: string): Promise<IpGeoResult | null> {
  const searcher = getIp2regionSearcher();
  if (!searcher) return null;
  // Throws on malformed / IPv6 input — the chain treats that as a miss.
  const raw: string = await searcher.search(ip);
  return parseIp2region(raw);
}

// pconline historically returns GBK-encoded JSON; decode as UTF-8 first and
// only fall back to GBK when the bytes are not valid UTF-8.
export function decodeGeoResponse(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("gbk").decode(bytes);
  }
}

// IANA zones used by devices physically in China. When the browser timezone
// disagrees with the IP egress country — e.g. device on Asia/Shanghai but the
// IP resolves overseas — the visitor is very likely tunneling through a
// VPN/proxy (or reverse-proxying back into China). Pure heuristic: flag as
// "suspected proxy", never as a certainty.
const CHINA_TIMEZONES = new Set(["Asia/Shanghai", "Asia/Urumqi"]);

export function isTimezoneMismatch(
  timezone: string | undefined | null,
  isChinaIp: boolean | undefined
): boolean {
  if (!timezone || isChinaIp === undefined) return false;
  return CHINA_TIMEZONES.has(timezone) !== isChinaIp;
}

// --- 高德: https://restapi.amap.com/v3/ip?key=...&ip=... ----------------------
// NOTE: Amap's database does not cover China carrier NAT egress IPs (returns
// empty province/city for them), so this is only a backup for broadband IPs.

const ipv4Agent = new https.Agent({ family: 4 });

interface AmapResponse {
  status?: string;
  province?: unknown;
  city?: unknown;
}

export function parseAmapResponse(data: AmapResponse | null | undefined): IpGeoResult | null {
  if (!data || data.status !== "1") return null;
  // Overseas/unknown IPs come back as empty arrays instead of strings.
  const region = typeof data.province === "string" ? data.province : "";
  const city = typeof data.city === "string" ? data.city : "";
  if (!region) return null;
  return { region, city, countryCode: "CN" };
}

async function lookupAmap(ip: string): Promise<IpGeoResult | null> {
  const key = process.env.AMAP_IP_GEO_KEY;
  if (!key) return null;
  const res = await axios.get("https://restapi.amap.com/v3/ip", {
    timeout: 3000,
    params: { key, ip },
    httpsAgent: ipv4Agent,
  });
  return parseAmapResponse(res.data);
}

// --- 太平洋免费接口（国内数据，无需 key；从 Vercel 基本不可达，仅作兜底） ----------
// {"ip":"...","pro":"四川省","city":"成都市","addr":"四川省成都市 电信","err":""}

interface PconlineResponse {
  err?: string;
  pro?: unknown;
  city?: unknown;
}

export function parsePconlineResponse(data: PconlineResponse | null | undefined): IpGeoResult | null {
  if (!data || data.err) return null;
  const region = typeof data.pro === "string" ? data.pro.trim() : "";
  const city = typeof data.city === "string" ? data.city.trim() : "";
  // Overseas IPs come back with empty pro/city — let the next provider try.
  if (!region) return null;
  return { region, city, countryCode: "CN" };
}

async function lookupPconline(ip: string): Promise<IpGeoResult | null> {
  const res = await axios.get("https://whois.pconline.com.cn/ipJson.jsp", {
    timeout: 4500,
    params: { ip, json: "true" },
    responseType: "arraybuffer",
    httpsAgent: ipv4Agent,
  });
  return parsePconlineResponse(JSON.parse(decodeGeoResponse(res.data)));
}

// --- ip-api.com（海外 IP 兜底，附带 proxy/hosting 标记） -------------------------

interface IpApiResponse {
  regionName?: unknown;
  city?: unknown;
  countryCode?: unknown;
  proxy?: unknown;
  hosting?: unknown;
}

export function parseIpApiResponse(data: IpApiResponse | null | undefined): IpGeoResult | null {
  if (!data) return null;
  const region = typeof data.regionName === "string" ? data.regionName : "";
  const city = typeof data.city === "string" ? data.city : "";
  if (!region) return null;
  return {
    region,
    city,
    countryCode: typeof data.countryCode === "string" ? data.countryCode : undefined,
    proxy: data.proxy === true ? true : undefined,
    hosting: data.hosting === true ? true : undefined,
  };
}

async function lookupIpApi(ip: string): Promise<IpGeoResult | null> {
  const res = await axios.get(`http://ip-api.com/json/${ip}`, {
    timeout: 2000,
    params: { fields: "regionName,city,countryCode,proxy,hosting" },
  });
  return parseIpApiResponse(res.data);
}

// -----------------------------------------------------------------------------

export async function getIpGeo(ip: string): Promise<IpGeoResult> {
  if (!ip || ip === "unknown" || ip === "127.0.0.1" || ip === "localhost" || ip === "::1") {
    return { region: "本地", city: "" };
  }
  if (isPrivateIp(ip)) {
    return { region: "内网", city: "" };
  }

  const cached = cache.get(ip);
  if (cached) return cached;

  // The offline DB is local and instant — retrying it is pointless; the
  // domestic network providers get one retry because their connectivity from
  // Vercel's overseas regions is poor.
  for (const lookup of [lookupIp2region, lookupAmap, lookupPconline, lookupIpApi]) {
    const attempts = lookup === lookupAmap || lookup === lookupPconline ? 2 : 1;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const result = await lookup(ip);
        if (result) return cacheResult(ip, result);
        break; // meaningful "not handled" — move down the chain
      } catch (error) {
        console.warn(`[IP Geo] ${lookup.name} attempt ${attempt}/${attempts} failed for ip:`, ip, (error as Error)?.message ?? error);
      }
    }
  }

  return cacheResult(ip, { region: "未知地区", city: "" });
}
