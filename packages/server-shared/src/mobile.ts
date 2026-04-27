import type { IncomingMessage } from "http";

function detectMobileFromHeaders(getHeader: (name: string) => string): boolean {
  const chMobile = getHeader("sec-ch-ua-mobile");
  if (chMobile) {
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

  const combinedCH =
    `${getHeader("sec-ch-ua-platform")} ${getHeader("sec-ch-ua")}`.toLowerCase();
  if (
    combinedCH.includes("android") ||
    combinedCH.includes("iphone") ||
    combinedCH.includes("ios")
  ) {
    return true;
  }

  const ua = getHeader("user-agent");
  if (ua) {
    const re =
      /Mobi|Android|iPhone|iPod|iPad|BlackBerry|IEMobile|Opera Mini|Mobile/i;
    return re.test(ua);
  }

  return false;
}

/**
 * 尝试从 Node.js HTTP 请求头判断客户端是否为手机。
 */
export function detectMobile(req: IncomingMessage): boolean {
  return detectMobileFromHeaders((name) => String(req.headers[name] ?? ""));
}

/**
 * 尝试从 Web API Request 请求头判断客户端是否为手机。
 * 可在 SSR 环境中直接使用（包括 Vite dev 模式）。
 */
export function detectMobileFromRequest(req: Request): boolean {
  return detectMobileFromHeaders((name) => req.headers.get(name) ?? "");
}
