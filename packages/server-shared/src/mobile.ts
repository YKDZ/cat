import type { IncomingMessage } from "http";

/**
 * 尝试从 HTTP 请求头判断客户端是否为手机。
 * 可在 SSR 环境中直接使用。
 */
export function detectMobile(req: IncomingMessage): boolean {
  const headers = req.headers;

  const chMobile = headers["sec-ch-ua-mobile"];
  if (typeof chMobile === "string") {
    if (
      chMobile === "?1" ||
      chMobile === "1" ||
      chMobile.toLowerCase() === "true"
    ) {
      return true;
    } else if (
      chMobile === "?0" ||
      chMobile === "0" ||
      chMobile.toLowerCase() === "false"
    ) {
      return false;
    }
  }

  const chPlatform = headers["sec-ch-ua-platform"] || "";
  const chUa = headers["sec-ch-ua"] || "";

  const combinedCH =
    `${chPlatform.toString()} ${chUa.toString()}`.toLowerCase();
  if (
    combinedCH.includes("android") ||
    combinedCH.includes("iphone") ||
    combinedCH.includes("ios")
  ) {
    return true;
  }

  const ua = headers["user-agent"] || "";
  if (ua) {
    const re =
      /Mobi|Android|iPhone|iPod|iPad|BlackBerry|IEMobile|Opera Mini|Mobile/i;
    return re.test(ua);
  }

  return false;
}
