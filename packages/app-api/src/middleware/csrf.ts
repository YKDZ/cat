import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * 生成 CSRF token（32 字节 hex）。
 */
export const generateCsrfToken = (): string => randomBytes(32).toString("hex");

/**
 * 使用 timing-safe 比较验证 CSRF token。
 * 当且仅当两个 token 均存在且相等时返回 true。
 */
export const verifyCsrfToken = (
  cookieToken: string | null,
  headerToken: string | undefined,
): boolean => {
  if (!cookieToken || !headerToken) return false;
  if (cookieToken.length !== headerToken.length) return false;
  return timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
};
