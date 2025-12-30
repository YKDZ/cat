import * as schema from "./schema/schema.ts";
import * as relations from "./schema/relations.ts";

export type DrizzleSchema = typeof schema & typeof relations;

export const combinedSchema: DrizzleSchema = {
  ...schema,
  ...relations,
};

export * from "./schema/schema.ts";
export * from "./schema/relations.ts";
