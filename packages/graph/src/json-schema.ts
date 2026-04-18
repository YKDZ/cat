// 自包含 JSON schema 工具 (Decision 10 = B)
// 等价于 @cat/shared/schema/json 中的 safeZDotJson / nonNullSafeZDotJson
// @cat/graph 不依赖 @cat/shared，保持图核心包的独立性
import * as z from "zod";

const isJSONText = (value: unknown): value is string =>
  typeof value === "string" && z.json().safeParse(value).success;

const isJSONableObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) return false;
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
};

export const safeZDotJson = z.any().refine((data) => {
  if (data === null) return true;
  if (isJSONText(data)) return true;
  return isJSONableObject(data);
});

export const nonNullSafeZDotJson = z.any().refine((data) => {
  if (data === null) return false;
  if (isJSONText(data)) return true;
  return isJSONableObject(data);
});
