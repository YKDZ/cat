import { JSONSchema, JSONType, JSONSchemaSchema } from "../schema/json";

export const getDefaultFromSchema = (schema: JSONSchema): JSONType => {
  if (schema.default !== undefined) {
    return schema.default;
  }

  if (schema.type === "object" || schema.properties) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj: Record<string, any> = {};
    const properties = schema.properties || {};

    for (const [key, propSchema] of Object.entries(properties)) {
      const value = getDefaultFromSchema(JSONSchemaSchema.parse(propSchema));
      if (value !== undefined) {
        obj[key] = value;
      }
    }
    return Object.keys(obj).length > 0 ? obj : null;
  }

  if (schema.type === "array" || schema.items) {
    if (schema.default !== undefined) return schema.default;

    const itemsSchema = schema.items;
    if (Array.isArray(itemsSchema)) {
      const arr = itemsSchema
        .map((item) => getDefaultFromSchema(JSONSchemaSchema.parse(item)))
        .filter((val) => val !== undefined);
      return arr.length > 0 ? arr : null;
    } else if (itemsSchema) {
      const itemDefault = getDefaultFromSchema(
        JSONSchemaSchema.parse(itemsSchema),
      );
      return itemDefault !== undefined ? [itemDefault] : null;
    }
    return null;
  }

  if (schema.oneOf || schema.anyOf) {
    const candidates = schema.oneOf || schema.anyOf || [];
    for (const candidate of candidates) {
      const result = getDefaultFromSchema(candidate);
      if (result !== undefined) return result;
    }
    return null;
  }

  if (schema.if && schema.then) {
    const ifResult = getDefaultFromSchema(JSONSchemaSchema.parse(schema.if));
    if (ifResult !== undefined) {
      const thenResult = getDefaultFromSchema(
        JSONSchemaSchema.parse(schema.then),
      );
      if (thenResult !== undefined) return thenResult;
    }
    if (schema.else) {
      return getDefaultFromSchema(JSONSchemaSchema.parse(schema.else));
    }
  }

  return {};
};
