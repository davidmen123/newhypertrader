import { describe, expect, it } from "vitest";

import { parseUserAgent } from "./_core/userAgent";

// Regression tests for the analytics mis-parsing reported in production:
// an iPhone visit from Safari showed up as "MacOS".

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1",
  iphoneWechat:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49",
  ipadSafari:
    "Mozilla/5.0 (iPad; CPU OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
  harmonyOs:
    "Mozilla/5.0 (Linux; Android 12; HarmonyOS; ALN-AL00; HMSCore 6.12.0.302) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
  windowsOpera:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/111.0.0.0",
  linuxFirefox:
    "Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0",
};

describe("parseUserAgent", () => {
  it("detects iPhone Safari as iOS, not MacOS", () => {
    expect(parseUserAgent(UA.iphoneSafari)).toEqual({
      deviceType: "mobile",
      os: "iOS",
      browser: "Safari",
    });
  });

  it("detects Chrome on iOS via the CriOS token", () => {
    expect(parseUserAgent(UA.iphoneChrome)).toEqual({
      deviceType: "mobile",
      os: "iOS",
      browser: "Chrome",
    });
  });

  it("detects the WeChat in-app browser on iOS", () => {
    expect(parseUserAgent(UA.iphoneWechat)).toEqual({
      deviceType: "mobile",
      os: "iOS",
      browser: "微信",
    });
  });

  it("detects iPad as iOS tablet", () => {
    expect(parseUserAgent(UA.ipadSafari)).toEqual({
      deviceType: "tablet",
      os: "iOS",
      browser: "Safari",
    });
  });

  it("detects Android Chrome", () => {
    expect(parseUserAgent(UA.androidChrome)).toEqual({
      deviceType: "mobile",
      os: "Android",
      browser: "Chrome",
    });
  });

  it("detects HarmonyOS before Android", () => {
    expect(parseUserAgent(UA.harmonyOs)).toEqual({
      deviceType: "mobile",
      os: "HarmonyOS",
      browser: "Chrome",
    });
  });

  it("detects a real Mac as MacOS desktop", () => {
    expect(parseUserAgent(UA.macSafari)).toEqual({
      deviceType: "desktop",
      os: "MacOS",
      browser: "Safari",
    });
  });

  it("detects Windows Chrome", () => {
    expect(parseUserAgent(UA.windowsChrome)).toEqual({
      deviceType: "desktop",
      os: "Windows",
      browser: "Chrome",
    });
  });

  it("detects Edge before Chrome", () => {
    expect(parseUserAgent(UA.windowsEdge)).toEqual({
      deviceType: "desktop",
      os: "Windows",
      browser: "Edge",
    });
  });

  it("detects Opera before Chrome", () => {
    expect(parseUserAgent(UA.windowsOpera)).toEqual({
      deviceType: "desktop",
      os: "Windows",
      browser: "Opera",
    });
  });

  it("detects Linux Firefox", () => {
    expect(parseUserAgent(UA.linuxFirefox)).toEqual({
      deviceType: "desktop",
      os: "Linux",
      browser: "Firefox",
    });
  });

  it("returns all-undefined for a missing UA", () => {
    expect(parseUserAgent(undefined)).toEqual({
      deviceType: undefined,
      os: undefined,
      browser: undefined,
    });
  });
});
