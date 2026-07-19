import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("axios", () => ({
  default: { get: vi.fn() },
}));

import axios from "axios";
import {
  __setIp2regionSearcherForTests,
  decodeGeoResponse,
  getIpGeo,
  isTimezoneMismatch,
  parseAmapResponse,
  parseIp2region,
  parseIpApiResponse,
  parsePconlineResponse,
} from "./_core/ipGeo";

const mockedGet = axios.get as ReturnType<typeof vi.fn>;

// NOTE: getIpGeo has a module-level result cache — every test below must use
// a unique IP, and beforeEach must use resetAllMocks (not clearAllMocks) so
// leftover mockResolvedValueOnce queues don't bleed across tests.

// GBK-encoded bytes of: {"pro":"四川省","city":"成都市","err":""}
const PCONLINE_GBK = Buffer.from([
  0x7b, 0x22, 0x70, 0x72, 0x6f, 0x22, 0x3a, 0x22, // {"pro":"
  0xcb, 0xc4, 0xb4, 0xa8, 0xca, 0xa1, // 四川省
  0x22, 0x2c, 0x22, 0x63, 0x69, 0x74, 0x79, 0x22, 0x3a, 0x22, // ","city":"
  0xb3, 0xc9, 0xb6, 0xbc, 0xca, 0xd0, // 成都市
  0x22, 0x2c, 0x22, 0x65, 0x72, 0x72, 0x22, 0x3a, 0x22, 0x22, 0x7d, // ","err":""}
]);

describe("decodeGeoResponse", () => {
  it("decodes GBK payloads (pconline)", () => {
    expect(decodeGeoResponse(PCONLINE_GBK)).toBe('{"pro":"四川省","city":"成都市","err":""}');
  });

  it("decodes plain UTF-8 payloads", () => {
    const buf = Buffer.from('{"pro":"四川省","city":"成都市"}', "utf-8");
    expect(decodeGeoResponse(buf)).toBe('{"pro":"四川省","city":"成都市"}');
  });
});

describe("parseIp2region", () => {
  it("parses a full domestic region string", () => {
    expect(parseIp2region("中国|四川省|成都市|移动|CN")).toEqual({
      region: "四川省",
      city: "成都市",
      countryCode: "CN",
    });
  });

  it("parses a direct-administered city (province == city-level)", () => {
    expect(parseIp2region("中国|上海|上海市|电信|CN")).toEqual({
      region: "上海",
      city: "上海市",
      countryCode: "CN",
    });
  });

  it("falls back to the country when the province is unknown", () => {
    expect(parseIp2region("United States|0|0|0|US")).toEqual({
      region: "United States",
      city: "",
      countryCode: "US",
    });
  });

  it("returns null for an all-unknown or malformed string", () => {
    expect(parseIp2region("0|0|0|0|0")).toBeNull();
    expect(parseIp2region("garbage")).toBeNull();
  });
});

describe("response parsers", () => {
  it("parses an amap success response as domestic (CN)", () => {
    expect(parseAmapResponse({ status: "1", province: "四川省", city: "成都市" })).toEqual({
      region: "四川省",
      city: "成都市",
      countryCode: "CN",
    });
  });

  it("rejects amap overseas/unknown responses (empty arrays)", () => {
    expect(parseAmapResponse({ status: "1", province: [], city: [] })).toBeNull();
    expect(parseAmapResponse({ status: "0" })).toBeNull();
    expect(parseAmapResponse(null)).toBeNull();
  });

  it("parses a pconline success response as domestic (CN)", () => {
    expect(parsePconlineResponse({ pro: "四川省", city: "成都市", err: "" })).toEqual({
      region: "四川省",
      city: "成都市",
      countryCode: "CN",
    });
  });

  it("rejects pconline overseas/error responses", () => {
    expect(parsePconlineResponse({ pro: "", city: "", err: "" })).toBeNull();
    expect(parsePconlineResponse({ pro: "", city: "", err: "noparse" })).toBeNull();
    expect(parsePconlineResponse(null)).toBeNull();
  });

  it("parses an ip-api response including proxy/hosting flags", () => {
    expect(
      parseIpApiResponse({ regionName: "California", city: "San Jose", countryCode: "US", proxy: true, hosting: false })
    ).toEqual({
      region: "California",
      city: "San Jose",
      countryCode: "US",
      proxy: true,
      hosting: undefined,
    });
  });

  it("omits proxy/hosting when ip-api reports them as false", () => {
    const result = parseIpApiResponse({ regionName: "California", city: "", countryCode: "US", proxy: false, hosting: false });
    expect(result?.proxy).toBeUndefined();
    expect(result?.hosting).toBeUndefined();
  });
});

describe("isTimezoneMismatch", () => {
  it("flags a China timezone with an overseas IP (翻墙)", () => {
    expect(isTimezoneMismatch("Asia/Shanghai", false)).toBe(true);
  });

  it("flags an overseas timezone with a China IP (回国代理)", () => {
    expect(isTimezoneMismatch("America/New_York", true)).toBe(true);
  });

  it("accepts a China timezone with a China IP", () => {
    expect(isTimezoneMismatch("Asia/Shanghai", true)).toBe(false);
    expect(isTimezoneMismatch("Asia/Urumqi", true)).toBe(false);
  });

  it("accepts an overseas timezone with an overseas IP", () => {
    expect(isTimezoneMismatch("America/New_York", false)).toBe(false);
    expect(isTimezoneMismatch("Asia/Singapore", false)).toBe(false);
  });

  it("does not flag when the timezone or geo country is unknown", () => {
    expect(isTimezoneMismatch(undefined, true)).toBe(false);
    expect(isTimezoneMismatch("Asia/Shanghai", undefined)).toBe(false);
  });
});

describe("getIpGeo with the offline database (real xdb file)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __setIp2regionSearcherForTests(undefined); // lazy-load the real file
  });

  it("locates a China Mobile NAT IP without any network call", async () => {
    expect(await getIpGeo("223.104.221.122")).toEqual({
      region: "四川省",
      city: "成都市",
      countryCode: "CN",
    });
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("locates an overseas IP without any network call", async () => {
    const result = await getIpGeo("8.8.8.8");
    expect(result.countryCode).toBe("US");
    expect(mockedGet).not.toHaveBeenCalled();
  });
});

describe("getIpGeo without the offline database (network chain)", () => {
  const savedKey = process.env.AMAP_IP_GEO_KEY;

  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.AMAP_IP_GEO_KEY;
    __setIp2regionSearcherForTests(null); // disable the offline provider
  });

  afterEach(() => {
    if (savedKey !== undefined) process.env.AMAP_IP_GEO_KEY = savedKey;
    __setIp2regionSearcherForTests(undefined);
  });

  it("short-circuits loopback and private IPs without any lookup", async () => {
    expect(await getIpGeo("127.0.0.1")).toEqual({ region: "本地", city: "" });
    expect(await getIpGeo("192.168.1.8")).toEqual({ region: "内网", city: "" });
    expect(await getIpGeo("10.0.0.3")).toEqual({ region: "内网", city: "" });
    expect(await getIpGeo("unknown")).toEqual({ region: "本地", city: "" });
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("resolves a domestic IP via pconline when amap is not configured", async () => {
    mockedGet.mockResolvedValueOnce({ data: PCONLINE_GBK });

    expect(await getIpGeo("118.112.1.1")).toEqual({ region: "四川省", city: "成都市", countryCode: "CN" });

    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedGet.mock.calls[0][0]).toContain("pconline");
  });

  it("retries pconline once before falling back to ip-api", async () => {
    mockedGet.mockRejectedValueOnce(new Error("timeout"));
    mockedGet.mockRejectedValueOnce(new Error("timeout"));
    mockedGet.mockResolvedValueOnce({ data: { regionName: "California", city: "San Jose", countryCode: "US", proxy: false, hosting: false } });

    expect(await getIpGeo("9.9.9.9")).toEqual({ region: "California", city: "San Jose", countryCode: "US" });

    expect(mockedGet).toHaveBeenCalledTimes(3);
    expect(mockedGet.mock.calls[2][0]).toContain("ip-api.com");
  });

  it("recovers when pconline fails once but succeeds on retry", async () => {
    mockedGet.mockRejectedValueOnce(new Error("timeout"));
    mockedGet.mockResolvedValueOnce({ data: PCONLINE_GBK });

    expect(await getIpGeo("118.112.9.9")).toEqual({ region: "四川省", city: "成都市", countryCode: "CN" });

    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(mockedGet.mock.calls[0][0]).toContain("pconline");
    expect(mockedGet.mock.calls[1][0]).toContain("pconline");
  });

  it("returns 未知地区 when every provider fails", async () => {
    mockedGet.mockRejectedValue(new Error("network down"));

    expect(await getIpGeo("203.0.113.9")).toEqual({ region: "未知地区", city: "" });
  });
});
