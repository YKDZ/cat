import type { NonNullJSONType } from "@cat/shared";

const SECRET_KEY_PATTERN =
  /(api[-_]?key|authorization|bearer|token|password|secret|secret[-_]?access[-_]?key|access[-_]?key)/i;

const SECRET_ASSIGNMENT_PATTERN =
  /\b(api[-_ ]?key|authorization|token|password|secret|secret[-_ ]?access[-_ ]?key|access[-_ ]?key)([\s:=]+)(Bearer\s+)?([^\s,;"']+)/gi;

const BEARER_TOKEN_PATTERN = /\b(Bearer\s+)([^\s,;"']+)/gi;

const REDACTED = "[REDACTED]";

/**
 * Redact common secret keys and values from a message string.
 *
 * @param message - Message text to redact
 * @returns - Redacted message text
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
 * Recursively redact sensitive keys and values from any JSON-compatible object.
 *
 * @param value - Value to redact
 * @returns - Redacted JSON value
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
 * Extract and redact a display-safe message from an error value.
 *
 * @param error - Original error value
 * @returns - Safe error message for display
 */
export const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return redactMessage(error.message);
  if (typeof error === "string") return redactMessage(error);
  return "未知插件检测错误";
};
