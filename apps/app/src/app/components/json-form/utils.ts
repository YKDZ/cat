import type { _JSONSchema } from "@cat/shared/schema/json";
import type { InjectionKey } from "vue";

export const schemaKey = Symbol() as InjectionKey<_JSONSchema>;

export const transferDataToString = (data: unknown, pretty = false): string => {
  if (typeof data === "string") return data;
  if (data === undefined) return "";
  if (data === null) return "null";

  return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
};
