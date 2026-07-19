import axios from "axios";

// IP geolocation for the analytics pipeline.
//
// Provider chain (first meaningful result wins):
//   1. 高德 IP 定位   — only when AMAP_IP_GEO_KEY is configured; most accurate
//      for Chinese carrier IPs.
//   2. whois.pconline — free, no key, domestic data; handles Chinese
//      mobile-carrier NAT egress addresses correctly.
//   3. ip-api.com     — legacy fallback, fine for overseas IPs.
//
// The previous ip-api-only setup mislocated Chinese mobile users — e.g. a
// China Mobile user in Chengdu was resolved to Guangzhou, Guangdong, because
// overseas GeoIP databases anchor carrier NAT egress IPs at the carrier's
// registered province.

interface IpGeoResult {
  region: string;
  city: string;
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

// --- 高德: https://restapi.amap.com/v3/ip?key=...&ip=... ----------------------

interface AmapResponse {
  status?: string;
  province?: unknown;
  city?: unknown;
}

export function parseAmapResponse(data: AmapResponse | null | undefined): IpGeoResult | null {
  if (!data || data.status !== "1") return null;
  // Overseas IPs come back as empty arrays instead of strings.
  const region = typeof data.province === "string" ? data.province : "";
  const city = typeof data.city === "string" ? data.city : "";
  if (!region) return null;
  return { region, city };
}

async function lookupAmap(ip: string): Promise<IpGeoResult | null> {
  const key = process.env.AMAP_IP_GEO_KEY;
  if (!key) return null;
  const res = await axios.get("https://restapi.amap.com/v3/ip", {
    timeout: 2000,
    params: { key, ip },
  });
  return parseAmapResponse(res.data);
}

// --- 太平洋免费接口（国内数据，无需 key） --------------------------------------
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
  return { region, city };
}

async function lookupPconline(ip: string): Promise<IpGeoResult | null> {
  const res = await axios.get("https://whois.pconline.com.cn/ipJson.jsp", {
    timeout: 2500,
    params: { ip, json: "true" },
    responseType: "arraybuffer",
  });
  return parsePconlineResponse(JSON.parse(decodeGeoResponse(res.data)));
}

// --- ip-api.com（海外 IP 兜底） ------------------------------------------------

interface IpApiResponse {
  regionName?: unknown;
  city?: unknown;
}

export function parseIpApiResponse(data: IpApiResponse | null | undefined): IpGeoResult | null {
  if (!data) return null;
  const region = typeof data.regionName === "string" ? data.regionName : "";
  const city = typeof data.city === "string" ? data.city : "";
  if (!region) return null;
  return { region, city };
}

async function lookupIpApi(ip: string): Promise<IpGeoResult | null> {
  const res = await axios.get(`http://ip-api.com/json/${ip}`, {
    timeout: 2000,
    params: { fields: "regionName,city" },
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

  for (const lookup of [lookupAmap, lookupPconline, lookupIpApi]) {
    try {
      const result = await lookup(ip);
      if (result) return cacheResult(ip, result);
    } catch (error) {
      console.warn(`[IP Geo] ${lookup.name} failed for ip:`, ip, (error as Error)?.message ?? error);
    }
  }

  return cacheResult(ip, { region: "未知地区", city: "" });
}
