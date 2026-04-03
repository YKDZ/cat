import type { EdgeCondition } from "./types.ts";

/**
 * Resolve a dotted-path string against an arbitrary data object.
 *
 * 从任意数据对象中按点分隔路径解析值。
 *
 * @example
 * resolvePath({ a: { b: 42 } }, "a.b") // 42
 */
export const resolvePath = (data: unknown, path: string): unknown => {
  if (typeof path !== "string" || path.length === 0) return undefined;
  const segments = path.split(".").filter(Boolean);
  let cursor: unknown = data;

  for (const segment of segments) {
    if (typeof cursor !== "object" || cursor === null) return undefined;
    cursor = Reflect.get(cursor, segment);
  }

  return cursor;
};

/**
 * Parse a raw string value into a typed primitive (boolean, number, null, or string).
 *
 * 将原始字符串值解析为类型化的原始值（布尔值、数字、null 或字符串）。
 */
export const parseExpectedValue = (
  raw: string,
): string | number | boolean | null => {
  const normalized = raw.trim();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  if (normalized === "null") return null;

  const maybeNumber = Number(normalized);
  if (!Number.isNaN(maybeNumber) && normalized.length > 0) {
    return maybeNumber;
  }

  return normalized;
};

/**
 * Evaluate a structured `EdgeCondition` against a blackboard data snapshot.
 *
 * 对黑板数据快照求值结构化的 `EdgeCondition`。
 *
 * Supported operators:
 * - `eq` / `neq`: strict equality / inequality
 * - `exists` / `not_exists`: presence check (non-null/undefined)
 * - `in`: check whether the field value is included in the provided array
 * - `gt` / `lt`: numeric comparison (coerces field value to number)
 */
export const evaluateCondition = (
  condition: EdgeCondition,
  data: unknown,
): boolean => {
  const actual = resolvePath(data, condition.field);

  switch (condition.operator) {
    case "eq":
      return actual === condition.value;

    case "neq":
      return actual !== condition.value;

    case "exists":
      return actual !== undefined && actual !== null;

    case "not_exists":
      return actual === undefined || actual === null;

    case "in": {
      const list = condition.value;
      if (!Array.isArray(list)) return false;
      return list.includes(actual);
    }

    case "gt": {
      const numActual = Number(actual);
      const numExpected = Number(condition.value);
      if (Number.isNaN(numActual) || Number.isNaN(numExpected)) return false;
      return numActual > numExpected;
    }

    case "lt": {
      const numActual = Number(actual);
      const numExpected = Number(condition.value);
      if (Number.isNaN(numActual) || Number.isNaN(numExpected)) return false;
      return numActual < numExpected;
    }

    default:
      return false;
  }
};
