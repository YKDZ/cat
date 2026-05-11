import { RerankRequestSchema } from "@cat/shared";
import { describe, expect, it } from "vitest";

describe("rerank context evidence hints", () => {
  it("accepts flattened evidence hints", () => {
    const parsed = RerankRequestSchema.parse({
      trigger: "context-route",
      surface: "memory",
      queryText: "Hello",
      band: { start: 0, end: 1 },
      candidates: [
        {
          candidateId: "memory:1",
          surface: "memory",
          originalIndex: 0,
          originalConfidence: 0.8,
          title: "Hello",
          sourceText: "Hello",
          targetText: "Bonjour",
        },
      ],
      contextHints: {
        evidence: [
          {
            purpose: "RECALL",
            priority: 0,
            label: "source text",
            score: 100,
            sourceEndpoint: "element:1",
            relatedEndpoint: null,
            trustLevel: "VERIFIED",
            freshness: null,
            clipped: false,
            payload: { text: "Hello" },
            expansion: null,
          },
        ],
      },
    });
    expect(parsed.contextHints?.evidence).toHaveLength(1);
  });

  it("accepts empty evidence hints", () => {
    const parsed = RerankRequestSchema.parse({
      trigger: "context-route",
      surface: "memory",
      queryText: "Hello",
      band: { start: 0, end: 1 },
      candidates: [
        {
          candidateId: "memory:1",
          surface: "memory",
          originalIndex: 0,
          originalConfidence: 0.8,
          title: "Hello",
          sourceText: "Hello",
        },
      ],
      contextHints: {},
    });
    expect(parsed.contextHints?.evidence).toEqual([]);
  });
});
