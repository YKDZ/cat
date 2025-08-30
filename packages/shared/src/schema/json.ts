import z from "zod";

export const JSONSchemaSchema = z
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
    get $defs() {
      return z.record(z.string(), JSONSchemaSchema).optional();
    },
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
    get additionalItems() {
      return BooleanAbleJSONSchemaSchema.optional();
    },
    get unevaluatedItems() {
      return BooleanAbleJSONSchemaSchema.optional();
    },
    get prefixItems() {
      return z.array(BooleanAbleJSONSchemaSchema).optional();
    },
    get items() {
      return z
        .array(BooleanAbleJSONSchemaSchema)
        .or(BooleanAbleJSONSchemaSchema)
        .optional();
    },
    get contains() {
      return BooleanAbleJSONSchemaSchema.optional();
    },
    get additionalProperties() {
      return BooleanAbleJSONSchemaSchema.optional();
    },
    get unevaluatedProperties() {
      return BooleanAbleJSONSchemaSchema.optional();
    },
    get properties() {
      return z.record(z.string(), BooleanAbleJSONSchemaSchema).optional();
    },
    get patternProperties() {
      return z.record(z.string(), BooleanAbleJSONSchemaSchema).optional();
    },
    get dependentSchemas() {
      return z.record(z.string(), BooleanAbleJSONSchemaSchema).optional();
    },
    get propertyNames() {
      return BooleanAbleJSONSchemaSchema.optional();
    },
    get if() {
      return BooleanAbleJSONSchemaSchema.optional();
    },

    get then() {
      return BooleanAbleJSONSchemaSchema.optional();
    },
    get else() {
      return BooleanAbleJSONSchemaSchema.optional();
    },
    get allOf() {
      return z.array(JSONSchemaSchema).optional();
    },
    get anyOf() {
      return z.array(JSONSchemaSchema).optional();
    },
    get oneOf() {
      return z.array(JSONSchemaSchema).optional();
    },
    get not() {
      return BooleanAbleJSONSchemaSchema.optional();
    },

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
    get dependentRequired() {
      return z.record(z.string(), z.array(z.string())).optional();
    },

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
    get contentSchema() {
      return JSONSchemaSchema.optional();
    },

    /* ---- extension slot as in your type ---- */
    _prefault: z.any().optional(),
  })
  .catchall(z.unknown());

export const BooleanAbleJSONSchemaSchema = JSONSchemaSchema.or(z.boolean());

export type JSONSchema = z.infer<typeof JSONSchemaSchema>;
