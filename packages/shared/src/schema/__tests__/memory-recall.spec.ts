import { describe, expect, it } from "vitest";

import {
  MemoryRecallBm25CapabilityEntrySchema,
  MemoryRecallBm25CompressionProfileSchema,
} from "../memory-recall.ts";
import { EvidenceLaneSchema } from "../precision-recall.ts";
import { RecallChannelSchema } from "../recall.ts";

describe("BM25 memory recall schemas", () => {
  it("accepts bm25 as a recall channel", () => {
    expect(RecallChannelSchema.parse("bm25")).toBe("bm25");
    expect(() => RecallChannelSchema.parse("not-a-channel")).toThrow();
  });

  it("accepts bm25 as an evidence lane", () => {
    expect(EvidenceLaneSchema.parse("bm25")).toBe("bm25");
  });

  it("parses enabled and disabled capability entries", () => {
    expect(
      MemoryRecallBm25CapabilityEntrySchema.parse({
        languageId: "en",
        enabled: true,
        textSearchConfig: "english",
        tokenizerLabel: "postgres-english",
        compressionProfile:
          MemoryRecallBm25CompressionProfileSchema.parse("bm25-ratio-k1-v1"),
        disabledReason: null,
      }),
    ).toEqual(
      expect.objectContaining({
        languageId: "en",
        enabled: true,
      }),
    );

    expect(
      MemoryRecallBm25CapabilityEntrySchema.parse({
        languageId: "ja",
        enabled: false,
        textSearchConfig: null,
        tokenizerLabel: null,
        compressionProfile: null,
        disabledReason: "not-in-bm25-first-rollout",
      }),
    ).toEqual(
      expect.objectContaining({
        languageId: "ja",
        enabled: false,
        disabledReason: "not-in-bm25-first-rollout",
      }),
    );
  });
});
