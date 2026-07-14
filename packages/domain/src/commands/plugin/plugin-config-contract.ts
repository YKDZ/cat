import { createHash } from "node:crypto";

import { sql } from "@cat/db";
import type { JSONSchema, _JSONSchema, NonNullJSONType } from "@cat/shared";
import { JSONSchemaSchema, getDefaultFromSchema } from "@cat/shared";
import * as z from "zod";

import type { DbHandle } from "#/types.ts";

export const LegacyUnverifiedPluginConfigVersion = "legacy-unverified";

const canonicalize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalize(Reflect.get(value, key))}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};

export const getCanonicalDigest = (value: unknown): string => {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
};

export const getPluginConfigSchemaDigest = (schema: JSONSchema): string => {
  return getCanonicalDigest(schema);
};

export const lockPluginConfigDefinition = async (
  db: DbHandle,
  pluginId: string,
): Promise<void> => {
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${pluginId}))`);
};

export const assertPluginConfigValueMatchesSchema = (
  schema: _JSONSchema,
  value: NonNullJSONType,
): void => {
  const result = z
    .fromJSONSchema(JSONSchemaSchema.parse(schema))
    .safeParse(value);
  if (!result.success) {
    throw new Error(
      `Plugin configuration does not satisfy its schema: ${result.error.issues
        .map((issue) => issue.message)
        .join(", ")}`,
    );
  }
};

export const getValidatedPluginConfigDefault = (
  schema: _JSONSchema,
): NonNullJSONType => {
  const value = getDefaultFromSchema(JSONSchemaSchema.parse(schema));
  if (value === undefined || value === null) {
    throw new Error(
      "Plugin configuration has no complete default value; an operator must configure it explicitly",
    );
  }

  assertPluginConfigValueMatchesSchema(schema, value);
  return value;
};
