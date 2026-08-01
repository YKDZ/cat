import { eq, languageAnalysisPolicy } from "@cat/db";
import {
  LanguageAnalysisPolicySnapshotSchema,
  type LanguageAnalysisPolicySnapshot,
} from "@cat/shared";

import type { Command } from "#/types.ts";

/** Raised before canonical writes when their external preflight became stale. */
export class StaleLanguageAnalysisPolicySnapshotError extends Error {
  public constructor() {
    super("Language Analysis policy changed after preflight.");
    this.name = "StaleLanguageAnalysisPolicySnapshotError";
  }
}

/**
 * Call this from the canonical write transaction after external probes finish.
 * Selection writers lock the same policy row before incrementing its epoch.
 */
export const assertLanguageAnalysisPolicySnapshot: Command<
  LanguageAnalysisPolicySnapshot,
  void
> = async (ctx, input) => {
  const snapshot = LanguageAnalysisPolicySnapshotSchema.parse(input);
  const [policy] = await ctx.db
    .select({ epoch: languageAnalysisPolicy.epoch })
    .from(languageAnalysisPolicy)
    .where(eq(languageAnalysisPolicy.id, 1))
    .limit(1)
    .for("update");
  if (policy?.epoch !== snapshot.policyEpoch) {
    throw new StaleLanguageAnalysisPolicySnapshotError();
  }
  return { events: [], result: undefined };
};
