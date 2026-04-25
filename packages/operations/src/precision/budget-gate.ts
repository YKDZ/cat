// packages/operations/src/precision/budget-gate.ts
import type { QueryProfile } from "@cat/shared";

import type { RecallCandidate } from "./types";

export type BudgetGateOptions = {
  maxTotal: number;
  /** Maximum number of reserved slots. Default: floor(maxTotal * 0.4) */
  maxReserved?: number;
};

/**
 * Reserved criteria (any ONE is sufficient):
 *  - memory exact match (channel "exact" present in evidences)
 *  - term complete surface equality (channel "lexical" with confidence >= 0.95)
 *  - template match (channel "template" present)
 *  - multi-evidence candidate with anchor-compatible match (hasNumericAnchor or hasPlaceholderAnchor)
 *
 * All remaining candidates enter the competitive pool up to maxTotal.
 * The budget gate annotates each candidate's `budgetClass` in-place and
 * returns the trimmed array in reserved-first order.
 */
export function applyBudgetGate(
  candidates: RecallCandidate[],
  profile: QueryProfile,
  opts: BudgetGateOptions,
): RecallCandidate[] {
  const maxReserved = opts.maxReserved ?? Math.floor(opts.maxTotal * 0.4);

  const isReserved = (c: RecallCandidate): boolean => {
    const channels = new Set(c.evidences.map((e) => e.channel));
    if (channels.has("exact")) return true;
    if (channels.has("template")) return true;
    if (
      channels.has("lexical") &&
      c.evidences.some((e) => e.channel === "lexical" && e.confidence >= 0.95)
    ) {
      return true;
    }
    if (
      (profile.hasNumericAnchor || profile.hasPlaceholderAnchor) &&
      c.evidences.length >= 2
    ) {
      return true;
    }
    return false;
  };

  const reserved: RecallCandidate[] = [];
  const competitive: RecallCandidate[] = [];

  for (const c of candidates) {
    if (isReserved(c) && reserved.length < maxReserved) {
      reserved.push({ ...c, budgetClass: "reserved" });
    } else {
      competitive.push({ ...c, budgetClass: "competitive" });
    }
  }

  const result = [
    ...reserved,
    ...competitive.slice(0, opts.maxTotal - reserved.length),
  ];

  // Record budget decision in rankingDecisions
  for (const c of result) {
    c.rankingDecisions.push({
      action: "budget-classified",
      note: `budgetClass=${c.budgetClass ?? "competitive"}`,
    });
  }

  return result;
}
