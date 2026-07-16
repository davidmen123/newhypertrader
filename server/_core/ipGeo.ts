import axios from "axios";

interface IpGeoResult {
  region: string;
  city: string;
}

const cache = new Map<string, IpGeoResult>();

export async function getIpGeo(ip: string): Promise<IpGeoResult> {
  if (!ip || ip === "unknown" || ip === "127.0.0.1" || ip === "localhost") {
    return { region: "本地", city: "" };
  }

  if (cache.has(ip)) {
    return cache.get(ip)!;
  }

  try {
    const response = await axios.get(`http://ip-api.com/json/${ip}`, {
      timeout: 5000,
      params: {
        fields: "regionName,city",
      },
    });

    const { regionName, city } = response.data;

    const result: IpGeoResult = {
      region: regionName || "未知地区",
      city: city || "",
    };

    cache.set(ip, result);

    if (cache.size > 1000) {
      const keys = Array.from(cache.keys());
      for (let i = 0; i < 500; i++) {
        cache.delete(keys[i]);
      }
    }

    return result;
  } catch (error) {
    return { region: "未知地区", city: "" };
  }
}