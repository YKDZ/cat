import { serverLogger as logger } from "@cat/server-shared";

import type { RawResult } from "../precision/types";
import type { CalibrationSummary } from "./types";

import { calibrateBm25Confidence } from "./core";

/**
 * @zh 对 term recall 的 RawResult[] 执行置信度校准（当前 term recall 无 BM25 通道，为架构一致性保留）。
 * @en Apply confidence calibration to term recall RawResult[] (currently no-op, reserved for architectural consistency).
 *
 * @param results - {@zh 原始术语召回结果} {@en Raw term recall results}
 * @param boostFactor - {@zh 提升因子（默认 2.5）} {@en Boost factor (default 2.5)}
 * @returns - {@zh 校准摘要} {@en Calibration summary}
 */
export const calibrateTermBm25 = (
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
        "CAL term adapter: calibration failed, returning unchanged",
      );
    return {
      bm25Count: 0,
      maxRaw: 0,
      boostFactor: boostFactor ?? 2.5,
      multiEvidenceCount: 0,
    };
  }
};
