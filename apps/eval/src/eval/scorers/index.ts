import type { Scorer } from "../types";

import { channelCoverageScorer } from "./channel-coverage";
import { confidenceScorer } from "./confidence";
import { f1Scorer } from "./f1";
import { hitRateScorer } from "./hit-rate";
import { latencyScorer } from "./latency";
import { mrrScorer } from "./mrr";
import { negativeExclusionScorer } from "./negative-exclusion";
import { precisionScorer } from "./precision";
import { recallScorer } from "./recall";

const scorerRegistry = new Map<string, Scorer>([
  ["precision", precisionScorer],
  ["recall", recallScorer],
  ["f1", f1Scorer],
  ["mrr", mrrScorer],
  ["hit-rate", hitRateScorer],
  ["negative-exclusion", negativeExclusionScorer],
  ["confidence", confidenceScorer],
  ["channel-coverage", channelCoverageScorer],
  ["latency", latencyScorer],
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
