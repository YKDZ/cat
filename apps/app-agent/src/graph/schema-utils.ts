import type { JSONSchema } from "@cat/shared/schema/json";

import * as z from "zod/v4";

const fallbackObjectSchema = z.record(z.string(), z.unknown());

export const toolSchemaToZod = (jsonSchema: JSONSchema): z.ZodType => {
  void jsonSchema;

  return fallbackObjectSchema;
};
