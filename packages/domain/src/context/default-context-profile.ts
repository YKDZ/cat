import type { ContextProfilePayload } from "@cat/shared";

export const DefaultContextProfilePayload = {
  preset: "default",
  relationWeights: {
    "core:contains:1.0.0": 10,
    "core:same-file:1.0.0": 8,
    "core:source-reference:1.0.0": 6,
  },
  consumerBudgets: {
    EDITOR: { maxItems: 20, maxTokens: 4000, maxTraversalDepth: 2 },
    RECALL: { maxItems: 10, maxTokens: 1800, maxTraversalDepth: 1 },
    QA: { maxItems: 15, maxTokens: 2500, maxTraversalDepth: 2 },
    AI: { maxItems: 12, maxTokens: 2200, maxTraversalDepth: 2 },
    AGENT: { maxItems: 20, maxTokens: 4000, maxTraversalDepth: 2 },
  },
  traversalCaps: { maxBranchingFactor: 16 },
  trustFreshnessRules: { staleAfterDays: 90 },
  fallbackBehavior: "LOCAL_SEQUENCE",
} satisfies ContextProfilePayload;
