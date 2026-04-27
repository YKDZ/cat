import type { Scorer } from "../types";

import { agentLatencyScorer } from "./agent-latency";
import { bm25ConfidenceScorer } from "./bm25-confidence";
import { channelCoverageScorer } from "./channel-coverage";
import { chrfScorer } from "./chrf";
import { confidenceScorer } from "./confidence";
import { decisionNoteScorer } from "./decision-note";
import { f1Scorer } from "./f1";
import { hitRateScorer } from "./hit-rate";
import { instructionAdherenceScorer } from "./instruction-adherence";
import { latencyScorer } from "./latency";
import { mrrScorer } from "./mrr";
import { negativeExclusionScorer } from "./negative-exclusion";
import { noiseRateScorer } from "./noise-rate";
import { precisionScorer } from "./precision";
import { preserveRateScorer } from "./preserve-rate";
import { recallScorer } from "./recall";
import { selfExclusionRateScorer } from "./self-exclusion-rate";
import { templateMatchRateScorer } from "./template-match-rate";
import { termComplianceScorer } from "./term-compliance";
import { tokenCostScorer } from "./token-cost";

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
