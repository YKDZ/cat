import type { OperationContext } from "@cat/domain";

import {
  createQaReviewRunWithFindings,
  executeCommand,
  executeQuery,
  getDbHandle,
  materializeQaReviewQueueItem,
  resolveQaReviewProfile,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";

import { normalizeQaResultItems } from "./normalize";
import { applyQaReviewPolicy } from "./policy";
import { runSemanticQaReview } from "./semantic-review";

export type RunQaReviewForTranslationInput = {
  projectId: string;
  elementId: number;
  translationId: number;
  languageId: string;
  sourceText: string;
  translationText: string;
  primaryContentNodeId?: string | null;
  branchId?: number | null;
  pullRequestId?: number | null;
  qaResultId: number;
  qaResultItemIds: number[];
  qaItems: Array<{ isPassed: boolean; checkerId: number; meta: unknown }>;
};

/**
 * @zh 运行翻译的 deterministic/semantic QA 审校管线并物化审校队列。
 * @en Run deterministic/semantic QA review pipeline for a translation and materialize the review queue item.
 */
export const runQaReviewForTranslationOp = async (
  input: RunQaReviewForTranslationInput,
  ctx?: OperationContext,
): Promise<{ queueItemId: number | null }> => {
  const { client: db } = await getDbHandle();
  const pluginManager =
    ctx?.pluginManager instanceof PluginManager ? ctx.pluginManager : undefined;
  const profile = await executeQuery({ db }, resolveQaReviewProfile, {
    projectId: input.projectId,
    languageId: input.languageId,
    contentNodeId: input.primaryContentNodeId,
    branchId: input.branchId,
  });

  const deterministicFindings = applyQaReviewPolicy({
    findings: normalizeQaResultItems({
      qaResultItemIds: input.qaResultItemIds,
      items: input.qaItems,
    }),
    profile: profile.config,
  });
  const deterministicRisk = Math.max(
    0,
    ...deterministicFindings.map((item) => item.riskScore),
  );

  await executeCommand(
    { db, traceId: ctx?.traceId },
    createQaReviewRunWithFindings,
    {
      projectId: input.projectId,
      elementId: input.elementId,
      translationId: input.translationId,
      qaResultId: input.qaResultId,
      profileId: profile.profileId,
      branchId: input.branchId ?? null,
      pullRequestId: input.pullRequestId ?? null,
      layer: "DETERMINISTIC",
      status: "COMPLETED",
      riskScore: deterministicRisk,
      summary:
        deterministicFindings.length === 0
          ? "Deterministic QA passed"
          : `${deterministicFindings.length} deterministic finding(s)`,
      meta: {
        profileId: profile.profileId,
        traceId: ctx?.traceId,
        deterministicOnly: !profile.config.enabledLayers.semantic,
      },
      findings: deterministicFindings,
    },
  );

  if (profile.config.enabledLayers.semantic) {
    const semantic = await runSemanticQaReview({
      projectId: input.projectId,
      elementId: input.elementId,
      translationId: input.translationId,
      sourceText: input.sourceText,
      translationText: input.translationText,
      profile: profile.config,
      pluginManager,
      signal: ctx?.signal,
    });

    await executeCommand(
      { db, traceId: ctx?.traceId },
      createQaReviewRunWithFindings,
      {
        projectId: input.projectId,
        elementId: input.elementId,
        translationId: input.translationId,
        profileId: profile.profileId,
        branchId: input.branchId ?? null,
        pullRequestId: input.pullRequestId ?? null,
        layer: "SEMANTIC",
        status: semantic.status,
        modelServiceId: semantic.modelServiceId,
        riskScore: Math.max(
          0,
          ...semantic.findings.map((item) => item.riskScore),
        ),
        summary: semantic.summary,
        errorMessage: semantic.errorMessage,
        meta: {
          profileId: profile.profileId,
          traceId: ctx?.traceId,
          rawError: semantic.errorMessage ?? undefined,
        },
        findings: semantic.findings,
      },
    );
  }

  const queue = await executeCommand(
    { db, traceId: ctx?.traceId },
    materializeQaReviewQueueItem,
    {
      projectId: input.projectId,
      languageId: input.languageId,
      elementId: input.elementId,
      translationId: input.translationId,
      branchId: input.branchId ?? null,
      pullRequestId: input.pullRequestId ?? null,
    },
  );

  return { queueItemId: queue.queueItemId };
};
