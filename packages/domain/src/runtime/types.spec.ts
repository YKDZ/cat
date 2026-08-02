import {
  DatabaseRequirementIdSchema,
  DatabaseRequirementStatusSchema,
} from "@cat/shared";
import { describe, expect, it } from "vitest";

describe("database requirement schemas", () => {
  it("exposes the fixed shared database requirements", () => {
    expect(DatabaseRequirementIdSchema.options).toEqual([
      "POSTGRESQL_CORE",
      "POSTGRESQL_TRIGRAM_MATCHING",
      "POSTGRESQL_VECTOR_STORAGE",
    ]);
    expect(DatabaseRequirementStatusSchema.options).toEqual([
      "SATISFIED",
      "BLOCKED",
      "UNKNOWN",
    ]);
  });
});
