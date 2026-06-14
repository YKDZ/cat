import { serverLogger as logger } from "@cat/server-shared";

import type { RawResult } from "../precision/types";
import type { CalibrationSummary } from "./types";

import { calibrateBm25Confidence } from "./core";

/**
 * Apply BM25 confidence calibration to memory recall RawResult[].
 *
 * Mutates the evidences array of each result in-place.
 *
 * @param results - Raw memory recall results
 * @param boostFactor - Boost factor (default 2.5)
 * @returns - Calibration summary
 */
export const calibrateMemoryBm25 = (
  results: RawResult[],
  boostFactor?: number,
): CalibrationSummary => {
  try {
    const evidencesByCandidate = results.map((r) => r.evidences);
    const { calibrated, summary } = calibrateBm25Confidence(
      evidencesByCandidate,
      boostFactor,
    );

    for (let i = 0; i < results.length; i += 1) {
      results[i].evidences = calibrated[i];
    }

    return summary;
  } catch (err) {
    logger
      .withSituation("OP")
      .warn(
        { err },
        "CAL memory adapter: calibration failed, returning unchanged",
      );
    return {
      bm25Count: 0,
      maxRaw: 0,
      boostFactor: boostFactor ?? 2.5,
      multiEvidenceCount: 0,
    };
  }
};
