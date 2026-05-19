import { describe, expect, it } from "vitest";

import { JSONSchemaSchema } from "../schema/json.ts";
import { getDefaultFromSchema } from "./json-schema.ts";

describe("getDefaultFromSchema", () => {
  it("does not seed array items when required fields are missing defaults", () => {
    const schema = JSONSchemaSchema.parse({
      type: "array",
      items: {
        type: "object",
        required: ["baseURL"],
        properties: {
          baseURL: { type: "string", format: "url" },
          timeoutMs: { type: "number", default: 3000 },
        },
      },
    });

    expect(getDefaultFromSchema(schema)).toBeUndefined();
  });

  it("preserves optional object defaults for form rendering", () => {
    const schema = JSONSchemaSchema.parse({
      type: "object",
      required: ["baseURL"],
      properties: {
        baseURL: { type: "string", format: "url" },
        timeoutMs: { type: "number", default: 3000 },
      },
    });

    expect(getDefaultFromSchema(schema)).toEqual({ timeoutMs: 3000 });
  });

  it("seeds array items when all required fields have defaults", () => {
    const schema = JSONSchemaSchema.parse({
      type: "array",
      items: {
        type: "object",
        required: ["baseURL"],
        properties: {
          baseURL: {
            type: "string",
            format: "url",
            default: "http://localhost:8000",
          },
          timeoutMs: { type: "number", default: 3000 },
        },
      },
    });

    expect(getDefaultFromSchema(schema)).toEqual([
      {
        baseURL: "http://localhost:8000",
        timeoutMs: 3000,
      },
    ]);
  });
});
