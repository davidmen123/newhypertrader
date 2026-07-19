// User-Agent parsing for the analytics pipeline.
//
// Check order matters:
// - iPhone/iPad UA strings contain "like Mac OS X", so iOS must be matched
//   before macOS, otherwise every Apple mobile device is reported as MacOS
//   (this was the old bug).
// - iOS browser apps use their own tokens (CriOS / EdgiOS / FxiOS) instead of
//   "Chrome" / "Edge" / "Firefox", so they must be checked first.
// - Desktop Edge/Opera UA strings also contain "Chrome", so they are checked
//   before plain Chrome.
//
// Known limitation: iPads in desktop mode (iPadOS 13+) send a plain Macintosh
// UA and are indistinguishable from a real Mac — they are reported as
// MacOS/desktop. There is no reliable UA-only workaround for that.

export interface ParsedUserAgent {
  deviceType: "desktop" | "mobile" | "tablet" | undefined;
  os: string | undefined;
  browser: string | undefined;
}

export function parseUserAgent(userAgent?: string | null): ParsedUserAgent {
  if (!userAgent) {
    return { deviceType: undefined, os: undefined, browser: undefined };
  }

  const ua = userAgent.toLowerCase();

  let deviceType: ParsedUserAgent["deviceType"];
  if (ua.includes("ipad") || ua.includes("tablet")) {
    deviceType = "tablet";
  } else if (ua.includes("mobile") || ua.includes("iphone") || ua.includes("android")) {
    deviceType = "mobile";
  } else {
    deviceType = "desktop";
  }

  let os: string | undefined;
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
    os = "iOS";
  } else if (ua.includes("harmonyos")) {
    os = "HarmonyOS";
  } else if (ua.includes("android")) {
    os = "Android";
  } else if (ua.includes("windows")) {
    os = "Windows";
  } else if (ua.includes("mac os") || ua.includes("macos") || ua.includes("macintosh")) {
    os = "MacOS";
  } else if (ua.includes("linux")) {
    os = "Linux";
  }

  let browser: string | undefined;
  if (ua.includes("micromessenger")) {
    browser = "微信";
  } else if (ua.includes("mqqbrowser") || ua.includes(" qq/")) {
    browser = "QQ浏览器";
  } else if (ua.includes("ucbrowser")) {
    browser = "UC浏览器";
  } else if (ua.includes("crios")) {
    browser = "Chrome"; // Chrome on iOS
  } else if (ua.includes("edgios") || ua.includes("edg/")) {
    browser = "Edge"; // Edge on iOS and desktop
  } else if (ua.includes("fxios")) {
    browser = "Firefox"; // Firefox on iOS
  } else if (ua.includes("opera") || ua.includes("opr/")) {
    browser = "Opera";
  } else if (ua.includes("chrome")) {
    browser = "Chrome";
  } else if (ua.includes("safari")) {
    browser = "Safari";
  } else if (ua.includes("firefox")) {
    browser = "Firefox";
  }

  return { deviceType, os, browser };
}
