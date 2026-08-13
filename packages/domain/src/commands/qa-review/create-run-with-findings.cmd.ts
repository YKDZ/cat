import { qaReviewFinding, qaReviewRun } from "@cat/db";
import {
  NormalizedQaFindingSchema,
  QaReviewRunLayerSchema,
  QaReviewRunMetaSchema,
  QaReviewRunStatusSchema,
  ServiceImplementationReferenceSchema,
  assertSingleNonNullish,
} from "@cat/shared";
import * as z from "zod";

import { domainEvent } from "#/events/domain-events.ts";
import type { Command, DbHandle } from "#/types.ts";

const CreateQaReviewRunWithFindingsCommandSchema = z.object({
  projectId: z.uuidv4(),
  elementId: z.int(),
  translationId: z.int().nullable(),
  qaResultId: z.int().nullable().optional(),
  profileId: z.int().nullable().optional(),
  branchId: z.int().nullable().optional(),
  pullRequestId: z.int().nullable().optional(),
  layer: QaReviewRunLayerSchema,
  status: QaReviewRunStatusSchema,
  checkerService: ServiceImplementationReferenceSchema.nullable().optional(),
  modelService: ServiceImplementationReferenceSchema.nullable().optional(),
  riskScore: z.int().min(0).max(100).default(0),
  summary: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  meta: QaReviewRunMetaSchema.nullable().optional(),
  findings: z.array(NormalizedQaFindingSchema),
});

export type CreateQaReviewRunWithFindingsCommand = z.infer<
  typeof CreateQaReviewRunWithFindingsCommandSchema
>;

export type CreateQaReviewRunWithFindingsResult = {
  runId: number;
  findingIds: number[];
};

type TxCapableDb = DbHandle & {
  transaction?: <T>(fn: (tx: DbHandle) => Promise<T>) => Promise<T>;
};

const insertRunWithFindings = async (
  db: DbHandle,
  input: CreateQaReviewRunWithFindingsCommand,
): Promise<CreateQaReviewRunWithFindingsResult> => {
  const cmd = CreateQaReviewRunWithFindingsCommandSchema.parse(input);
  const insertedRun = assertSingleNonNullish(
    await db
      .insert(qaReviewRun)
      .values({
        projectId: cmd.projectId,
        elementId: cmd.elementId,
        translationId: cmd.translationId,
        qaResultId: cmd.qaResultId ?? null,
        profileId: cmd.profileId ?? null,
        branchId: cmd.branchId ?? null,
        pullRequestId: cmd.pullRequestId ?? null,
        layer: cmd.layer,
        status: cmd.status,
        checkerService: cmd.checkerService ?? null,
        modelService: cmd.modelService ?? null,
        riskScore: cmd.riskScore,
        summary: cmd.summary ?? null,
        errorMessage: cmd.errorMessage ?? null,
        meta: cmd.meta ?? null,
      })
      .returning({ id: qaReviewRun.id }),
  );

  const findingIds =
    cmd.findings.length === 0
      ? []
      : (
          await db
            .insert(qaReviewFinding)
            .values(
              cmd.findings.map((finding) => ({
                runId: insertedRun.id,
                projectId: cmd.projectId,
                elementId: cmd.elementId,
                translationId: cmd.translationId,
                qaResultItemId: finding.qaResultItemId ?? null,
                checkerService: finding.checkerService ?? null,
                layer: finding.layer,
                ruleId: finding.ruleId,
                ruleFamily: finding.ruleFamily,
                severity: finding.severity,
                action: finding.action,
                disposition: finding.disposition,
                confidenceBasisPoints: finding.confidenceBasisPoints,
                riskScore: finding.riskScore,
                message: finding.message,
                explanation: finding.explanation,
                sourceSpan: finding.sourceSpan,
                targetSpan: finding.targetSpan,
                suggestedText: finding.suggestedText,
                meta: finding.meta,
              })),
            )
            .returning({ id: qaReviewFinding.id })
        ).map((row) => row.id);

  return {
    runId: insertedRun.id,
    findingIds,
  };
};

/**
 * Create a QA review run and its findings in the same transaction.
 */
export const createQaReviewRunWithFindings: Command<
  CreateQaReviewRunWithFindingsCommand,
  CreateQaReviewRunWithFindingsResult
> = async (ctx, input) => {
  const txCandidate = ctx.db as TxCapableDb;
  const cmd = CreateQaReviewRunWithFindingsCommandSchema.parse(input);
  const result =
    typeof txCandidate.transaction === "function"
      ? await txCandidate.transaction(
          async (tx) => await insertRunWithFindings(tx, cmd),
        )
      : await insertRunWithFindings(ctx.db, cmd);

  return {
    result,
    events: [
      domainEvent("qa-review:run-completed", {
        projectId: cmd.projectId,
        elementId: cmd.elementId,
        ...(cmd.translationId === null
          ? {}
          : { translationId: cmd.translationId }),
        runId: result.runId,
        findingCount: result.findingIds.length,
        maxRiskScore: cmd.riskScore,
      }),
    ],
  };
};
