import * as z from "zod/v4";

export const safeZDotJson = z.any().refine((v) => z.json().parse(v));

export const _JSONSchemaSchema = z
  .object({
    $schema: z
      .enum([
        "https://json-schema.org/draft/2020-12/schema",
        "http://json-schema.org/draft-07/schema#",
        "http://json-schema.org/draft-04/schema#",
      ])
      .optional(),
    $id: z.string().optional(),
    $anchor: z.string().optional(),
    $ref: z.string().optional(),
    $dynamicRef: z.string().optional(),
    $dynamicAnchor: z.string().optional(),
    $vocabulary: z.record(z.string(), z.boolean()).optional(),
    $comment: z.string().optional(),
    // get $defs() {
    //   // @ts-expect-error unsolvable
    //   return z.lazy(() => z.record(z.string(), JSONSchemaSchema)).optional();
    // },
    type: z
      .enum([
        "object",
        "array",
        "string",
        "number",
        "boolean",
        "null",
        "integer",
      ])
      .optional(),
    // get additionalItems() {
    //   return z.lazy(() => JSONSchemaSchema).optional();
    // },
    // get unevaluatedItems() {
    //   return z.lazy(() => JSONSchemaSchema).optional();
    // },
    get prefixItems() {
      return z.lazy(() => z.array(JSONSchemaSchema)).optional();
    },
    get items() {
      return z
        .lazy(() => z.array(JSONSchemaSchema).or(JSONSchemaSchema))
        .optional();
    },
    // get contains() {
    //   return z.lazy(() => JSONSchemaSchema).optional();
    // },
    // get additionalProperties() {
    //   return z.lazy(() => JSONSchemaSchema).optional();
    // },
    // get unevaluatedProperties() {
    //   return z.lazy(() => JSONSchemaSchema).optional();
    // },
    get properties() {
      return z.record(z.string(), JSONSchemaSchema).optional();
    },
    // get patternProperties() {
    //   return z
    //     .lazy(() => z.record(z.string(), JSONSchemaSchema))
    //     .optional();
    // },
    // get dependentSchemas() {
    //   return z
    //     .lazy(() => z.record(z.string(), JSONSchemaSchema))
    //     .optional();
    // },
    // get propertyNames() {
    //   return z.lazy(() => JSONSchemaSchema).optional();
    // },
    // get if() {
    //   return z.lazy(() => JSONSchemaSchema).optional();
    // },

    // get then() {
    //   return z.lazy(() => JSONSchemaSchema).optional();
    // },
    // get else() {
    //   return z.lazy(() => JSONSchemaSchema).optional();
    // },
    // get allOf() {
    //   return z.array(JSONSchemaSchema).optional();
    // },
    get anyOf() {
      return z.array(_JSONSchemaSchema).optional();
    },
    get oneOf() {
      return z.array(_JSONSchemaSchema).optional();
    },
    // get not() {
    //   return z.lazy(() => JSONSchemaSchema).optional();
    // },

    multipleOf: z.number().optional(),
    maximum: z.number().optional(),
    exclusiveMaximum: z.number().or(z.boolean()).optional(),
    minimum: z.number().optional(),
    exclusiveMinimum: z.number().or(z.boolean()).optional(),

    maxLength: z.number().optional(),
    minLength: z.number().optional(),
    pattern: z.string().optional(),

    maxItems: z.number().optional(),
    minItems: z.number().optional(),
    uniqueItems: z.boolean().optional(),
    maxContains: z.number().optional(),
    minContains: z.number().optional(),

    maxProperties: z.number().optional(),
    minProperties: z.number().optional(),
    required: z.array(z.string()).optional(),
    // get dependentRequired() {
    //   return z.record(z.string(), z.array(z.string())).optional();
    // },

    enum: z
      .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional(),
    const: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),

    id: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    default: z.any().optional(),
    deprecated: z.boolean().optional(),
    readOnly: z.boolean().optional(),
    writeOnly: z.boolean().optional(),
    nullable: z.boolean().optional(),
    examples: z.array(z.any()).optional(),
    format: z.string().optional(),

    /* ---- content encoding / media ---- */
    contentMediaType: z.string().optional(),
    contentEncoding: z.string().optional(),
    // get contentSchema() {
    //   return JSONSchemaSchema.optional();
    // },
  })
  .catchall(z.unknown());

export const JSONSchemaSchema = _JSONSchemaSchema.or(z.boolean());

export type JSONSchema = z.infer<typeof JSONSchemaSchema>;
export type _JSONSchema = z.infer<typeof _JSONSchemaSchema>;
export type JSONType = z.infer<ReturnType<typeof z.json>>;
