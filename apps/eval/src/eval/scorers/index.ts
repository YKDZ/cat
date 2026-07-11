import type { Scorer } from "../types.ts";
import { agentLatencyScorer } from "./agent-latency.ts";
import { bm25ConfidenceScorer } from "./bm25-confidence.ts";
import { channelCoverageScorer } from "./channel-coverage.ts";
import { chrfScorer } from "./chrf.ts";
import { confidenceScorer } from "./confidence.ts";
import { decisionNoteScorer } from "./decision-note.ts";
import { f1Scorer } from "./f1.ts";
import { hitRateScorer } from "./hit-rate.ts";
import { instructionAdherenceScorer } from "./instruction-adherence.ts";
import { latencyScorer } from "./latency.ts";
import { mrrScorer } from "./mrr.ts";
import { negativeExclusionScorer } from "./negative-exclusion.ts";
import { noiseRateScorer } from "./noise-rate.ts";
import { precisionScorer } from "./precision.ts";
import { preserveRateScorer } from "./preserve-rate.ts";
import { recallScorer } from "./recall.ts";
import { selfExclusionRateScorer } from "./self-exclusion-rate.ts";
import { templateMatchRateScorer } from "./template-match-rate.ts";
import { termComplianceScorer } from "./term-compliance.ts";
import { tokenCostScorer } from "./token-cost.ts";

const scorerRegistry = new Map<string, Scorer>([
  ["precision", precisionScorer],
  ["recall", recallScorer],
  ["f1", f1Scorer],
  ["mrr", mrrScorer],
  ["hit-rate", hitRateScorer],
  ["negative-exclusion", negativeExclusionScorer],
  ["confidence", confidenceScorer],
  ["channel-coverage", channelCoverageScorer],
  ["decision-note", decisionNoteScorer],
  ["latency", latencyScorer],
  ["instruction-adherence", instructionAdherenceScorer],
  ["term-compliance", termComplianceScorer],
  ["chrf", chrfScorer],
  ["token-cost", tokenCostScorer],
  ["agent-latency", agentLatencyScorer],
  ["noise-rate", noiseRateScorer],
  ["bm25-confidence", bm25ConfidenceScorer],
  ["template-match-rate", templateMatchRateScorer],
  ["self-exclusion-rate", selfExclusionRateScorer],
  ["preserve-rate", preserveRateScorer],
]);

export const getScorer = (name: string): Scorer => {
  const scorer = scorerRegistry.get(name);
  if (!scorer)
    throw new Error(
      `Unknown scorer: "${name}". Available: ${[...scorerRegistry.keys()].join(", ")}`,
    );
  return scorer;
};

export const getAllScorers = (): Map<string, Scorer> => scorerRegistry;
