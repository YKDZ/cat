import type { NonNullJSONType } from "@cat/shared";

const SECRET_KEY_PATTERN =
  /(api[-_]?key|authorization|bearer|token|password|secret|secret[-_]?access[-_]?key|access[-_]?key)/i;

const SECRET_ASSIGNMENT_PATTERN =
  /\b(api[-_ ]?key|authorization|token|password|secret|secret[-_ ]?access[-_ ]?key|access[-_ ]?key)([\s:=]+)(Bearer\s+)?([^\s,;"']+)/gi;

const BEARER_TOKEN_PATTERN = /\b(Bearer\s+)([^\s,;"']+)/gi;

const REDACTED = "[REDACTED]";

/**
 * @zh 对消息文本中的常见密钥和值进行脱敏。
 * @en Redact common secret keys and values from a message string.
 *
 * @param message - {@zh 待脱敏的消息文本} {@en Message text to redact}
 * @returns - {@zh 已脱敏的消息文本} {@en Redacted message text}
 */
export const redactMessage = (message: string): string => {
  return message
    .replace(BEARER_TOKEN_PATTERN, `$1${REDACTED}`)
    .replace(
      SECRET_ASSIGNMENT_PATTERN,
      (_match, key: string, separator: string, bearer: string | undefined) =>
        `${key}${separator}${bearer ?? ""}${REDACTED}`,
    );
};

/**
 * @zh 递归脱敏任意 JSON 兼容对象中的敏感字段和值。
 * @en Recursively redact sensitive keys and values from any JSON-compatible object.
 *
 * @param value - {@zh 待脱敏的值} {@en Value to redact}
 * @returns - {@zh 已脱敏的 JSON 值} {@en Redacted JSON value}
 */
export const redactJson = (value: unknown): NonNullJSONType => {
  if (value === null || value === undefined) return {};
  if (typeof value === "string") return redactMessage(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((item) => redactJson(item));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? REDACTED : redactJson(entry),
      ]),
    );
  }
  return REDACTED;
};

/**
 * @zh 提取并脱敏错误对象中的可展示消息。
 * @en Extract and redact a display-safe message from an error value.
 *
 * @param error - {@zh 原始错误对象} {@en Original error value}
 * @returns - {@zh 可安全展示的错误消息} {@en Safe error message for display}
 */
export const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return redactMessage(error.message);
  if (typeof error === "string") return redactMessage(error);
  return "未知插件检测错误";
};
