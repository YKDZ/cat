import { describe, expect, it } from "vitest";

import { RuntimeFeatureSchema } from "./types.ts";

describe("RuntimeFeatureSchema", () => {
  it("does not expose the retired BM25 memory recall feature", () => {
    expect(RuntimeFeatureSchema.safeParse("bm25-memory-recall").success).toBe(
      false,
    );
    expect(RuntimeFeatureSchema.parse("pgvector")).toBe("pgvector");
  });
});
