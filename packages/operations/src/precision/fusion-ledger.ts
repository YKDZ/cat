// packages/operations/src/precision/fusion-ledger.ts
import type { RecallEvidence } from "@cat/shared";

import type { RawResult, RecallCandidate } from "./types";

import { candidateKey } from "./types";

const evidenceKey = (e: RecallEvidence): string =>
  [
    e.channel,
    e.matchedText ?? "",
    e.matchedVariantText ?? "",
    e.matchedVariantType ?? "",
    e.note ?? "",
  ].join("\0");

/**
 * Build a Fusion Ledger from a flat list of raw results from all lanes.
 *
 * For each unique candidate (by candidateKey):
 *  - Keeps the body fields from the highest-confidence lane result.
 *  - Unions evidences from all lanes (deduped by evidenceKey).
 *  - Sets confidence = max across all lanes.
 *  - Records a "ledger-merged" RankingDecision.
 *
 * Returns RecallCandidate[] sorted by descending confidence.
 */
export function buildFusionLedger(raw: RawResult[]): RecallCandidate[] {
  const ledger = new Map<string, RecallCandidate>();

  for (const result of raw) {
    const key = candidateKey(result);
    const existing = ledger.get(key);

    if (!existing) {
      ledger.set(key, {
        ...result,
        evidences: [...result.evidences],
        rankingDecisions: [
          {
            action: "ledger-entered",
            note: `first seen via ${result.evidences[0]?.channel ?? "unknown"} lane`,
          },
        ],
      });
      continue;
    }

    // Merge evidences
    const seenEvKey = new Set(existing.evidences.map(evidenceKey));
    for (const ev of result.evidences) {
      const k = evidenceKey(ev);
      if (seenEvKey.has(k)) continue;
      seenEvKey.add(k);
      existing.evidences.push(ev);
    }

    // Update confidence and body fields to the higher-confidence winner
    if (result.confidence > existing.confidence) {
      // Replace all scalar body fields except evidences and rankingDecisions
      const { evidences: _ev, ...body } = result;
      Object.assign(existing, body);
      existing.rankingDecisions.push({
        action: "ledger-confidence-updated",
        note: `confidence raised to ${result.confidence.toFixed(3)} by ${result.evidences[0]?.channel ?? "unknown"} lane`,
      });
    } else {
      existing.rankingDecisions.push({
        action: "ledger-evidence-merged",
        note: `evidence merged from ${result.evidences[0]?.channel ?? "unknown"} lane (confidence ${result.confidence.toFixed(3)} not higher)`,
      });
    }

    existing.confidence = Math.max(existing.confidence, result.confidence);
  }

  return [...ledger.values()].sort(
    (a, b) =>
      b.confidence - a.confidence ||
      ("term" in a && "term" in b
        ? b.term.length - (a as { term: string }).term.length
        : 0),
  );
}
