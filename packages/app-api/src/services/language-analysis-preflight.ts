import {
  executeQuery,
  listProjectLanguageAnalysisRequirements,
} from "@cat/domain";
import {
  assessLanguageAnalysisConfiguration,
  type LanguageAnalysisOperationContext,
} from "@cat/operations";
import {
  LanguageAnalysisPolicySnapshotSchema,
  normalizeLanguageId,
  type LanguageAnalysisPolicySnapshot,
} from "@cat/shared";
import { ORPCError } from "@orpc/client";

import type { Context } from "#/utils/context.ts";

export const assertLanguageAnalysisPreflight = async (
  languageIds: readonly string[],
  context: Pick<Context, "drizzleDB" | "pluginManager" | "requestSignal">,
): Promise<LanguageAnalysisPolicySnapshot> => {
  const operationContext: LanguageAnalysisOperationContext = {
    db: context.drizzleDB.client,
    pluginManager: context.pluginManager,
    signal: context.requestSignal,
    traceId: "language-analysis-preflight",
  };
  const normalizedLanguageIds = [
    ...new Set(languageIds.map(normalizeLanguageId)),
  ].sort((left, right) => left.localeCompare(right));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const assessments = await Promise.all(
      normalizedLanguageIds.map(
        async (languageId) =>
          await assessLanguageAnalysisConfiguration(
            { languageId },
            operationContext,
          ),
      ),
    );
    for (const assessment of assessments) {
      if (assessment.status === "BLOCKED" && !assessment.blocker!.retryable) {
        throw new ORPCError("BAD_REQUEST", {
          message: `Language Analysis is blocked: ${assessment.blocker!.reason}`,
        });
      }
    }
    const policyEpoch = assessments[0]?.policyEpoch;
    if (
      policyEpoch !== undefined &&
      assessments.every((assessment) => assessment.policyEpoch === policyEpoch)
    ) {
      return LanguageAnalysisPolicySnapshotSchema.parse({ policyEpoch });
    }
  }
  throw new ORPCError("CONFLICT", {
    message: "Language Analysis policy changed during preflight.",
  });
};

export const assertProjectLanguageAnalysisPreflight = async (
  projectId: string,
  incomingLanguageIds: readonly string[],
  context: Pick<Context, "drizzleDB" | "pluginManager" | "requestSignal">,
): Promise<LanguageAnalysisPolicySnapshot> => {
  const existingLanguageIds = await executeQuery(
    { db: context.drizzleDB.client },
    listProjectLanguageAnalysisRequirements,
    { projectId },
  );
  const requiredLanguageIds = [
    ...new Set([
      ...incomingLanguageIds.map(normalizeLanguageId),
      ...existingLanguageIds.map(normalizeLanguageId),
    ]),
  ].sort((left, right) => left.localeCompare(right));
  return await assertLanguageAnalysisPreflight(requiredLanguageIds, context);
};
