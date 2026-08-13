import { describe, expect, it } from "vitest";

import { ServiceImplementationReferenceSchema } from "#/schema/service-implementation-reference.ts";

describe("ServiceImplementationReferenceSchema", () => {
  it("accepts a stable implementation identity and installation scope", () => {
    expect(
      ServiceImplementationReferenceSchema.parse({
        pluginId: "vectors",
        serviceId: "primary",
        serviceType: "TEXT_VECTORIZER",
        scopeType: "GLOBAL",
        scopeId: "",
      }),
    ).toEqual({
      pluginId: "vectors",
      serviceId: "primary",
      serviceType: "TEXT_VECTORIZER",
      scopeType: "GLOBAL",
      scopeId: "",
    });
  });

  it("rejects database surrogates in place of a logical identity", () => {
    expect(() =>
      ServiceImplementationReferenceSchema.parse({
        pluginId: "vectors",
        serviceId: 42,
        serviceType: "TEXT_VECTORIZER",
        scopeType: "GLOBAL",
        scopeId: "",
      }),
    ).toThrow();
  });

  it("rejects non-canonical and blank scoped identities", () => {
    for (const invalidReference of [
      {
        pluginId: "vectors",
        serviceId: "primary",
        serviceType: "TEXT_VECTORIZER",
        scopeType: "GLOBAL",
        scopeId: "project-1",
      },
      {
        pluginId: "vectors",
        serviceId: " primary ",
        serviceType: "TEXT_VECTORIZER",
        scopeType: "PROJECT",
        scopeId: "project-1",
      },
      {
        pluginId: "vectors",
        serviceId: "primary",
        serviceType: "TEXT_VECTORIZER",
        scopeType: "USER",
        scopeId: " ",
      },
      {
        pluginId: "vectors",
        serviceId: "primary",
        serviceType: "TEXT_VECTORIZER",
        scopeType: "PROJECT",
        scopeId: " project-1 ",
      },
      {
        pluginId: "vectors",
        serviceId: "primary",
        serviceType: "TEXT_VECTORIZER",
        scopeType: "GLOBAL",
        scopeId: "",
        dbId: 42,
      },
    ]) {
      expect(
        ServiceImplementationReferenceSchema.safeParse(invalidReference)
          .success,
      ).toBe(false);
    }
  });
});
