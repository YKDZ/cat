import * as z from "zod/v4";

export const safeZDotJson = z.any().refine((data) => {
  return z.json().safeParse(data).success;
});

export const nonNullSafeZDotJson = z.any().refine((data) => {
  return data !== null && z.json().safeParse(data).success;
});

export type JSONSchema = boolean | _JSONSchema;
export type _JSONSchema = {
  [k: string]: unknown;
  $schema?:
    | "https://json-schema.org/draft/2020-12/schema"
    | "http://json-schema.org/draft-07/schema#"
    | "http://json-schema.org/draft-04/schema#";
  $id?: string;
  $anchor?: string;
  $ref?: string;
  $dynamicRef?: string;
  $dynamicAnchor?: string;
  $vocabulary?: Record<string, boolean>;
  $comment?: string;
  $defs?: Record<string, _JSONSchema>;
  type?:
    | "object"
    | "array"
    | "string"
    | "number"
    | "boolean"
    | "null"
    | "integer";
  additionalItems?: JSONSchema;
  unevaluatedItems?: JSONSchema;
  prefixItems?: JSONSchema[];
  items?: JSONSchema | JSONSchema[];
  contains?: JSONSchema;
  additionalProperties?: JSONSchema;
  unevaluatedProperties?: JSONSchema;
  properties?: Record<string, JSONSchema>;
  patternProperties?: Record<string, JSONSchema>;
  dependentSchemas?: Record<string, JSONSchema>;
  propertyNames?: JSONSchema;
  if?: JSONSchema;
  then?: JSONSchema;
  else?: JSONSchema;
  allOf?: _JSONSchema[];
  anyOf?: _JSONSchema[];
  oneOf?: _JSONSchema[];
  not?: JSONSchema;
  multipleOf?: number;
  maximum?: number;
  exclusiveMaximum?: number | boolean;
  minimum?: number;
  exclusiveMinimum?: number | boolean;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  maxItems?: number;
  minItems?: number;
  uniqueItems?: boolean;
  maxContains?: number;
  minContains?: number;
  maxProperties?: number;
  minProperties?: number;
  required?: string[];
  dependentRequired?: Record<string, string[]>;
  enum?: Array<string | number | boolean | null>;
  const?: string | number | boolean | null;
  id?: string;
  title?: string;
  description?: string;
  default?: unknown;
  deprecated?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  nullable?: boolean;
  examples?: unknown[];
  format?: string;
  contentMediaType?: string;
  contentEncoding?: string;
  contentSchema?: _JSONSchema;
  _prefault?: unknown;
};

export type JSONType =
  | string
  | number
  | boolean
  | null
  | JSONArray
  | JSONObject;

export interface JSONObject {
  [key: string]: JSONType;
}

export const JSONSchemaSchema = z.custom<JSONSchema>((data) => {
  return z.json().safeParse(data).success;
});

export const _JSONSchemaSchema = z.custom<_JSONSchema>((data) => {
  return z.json().safeParse(data).success;
});

export type JSONArray = JSONType[];
export type NonNullJSONType = Exclude<JSONType, null>;
