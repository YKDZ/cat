import type { NormalizedQaFinding } from "@cat/shared";

import {
  eq,
  getColumns,
  qaReviewAnnotation,
  qaReviewQueueItem,
  vectorizedString,
} from "@cat/db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  claimQaReviewQueueItem,
  createContentNodeUnderParent,
  createElements,
  createProject,
  createQaReviewAnnotation,
  createQaReviewRunWithFindings,
  createQaReviewSuggestion,
  createRootContentNode,
  createTranslations,
  createUser,
  ensureCoreRelationTypes,
  ensureLanguages,
  markQaReviewSuggestionApplied,
  materializeQaReviewQueueItem,
  rejectQaReviewSuggestion,
  submitQaReviewAction,
  submitQaReviewDecision,
  transitionQaReviewAnnotation,
} from "@/commands";
import { executeCommand } from "@/executor";
import { setupTestDB, type TestDB } from "@/testing/setup-test-db";

let testDb: TestDB;
let creatorId: string;
let reviewerAId: string;
let reviewerBId: string;

const insertString = async (value: string, languageId: string) => {
  const [row] = await testDb.client
    .insert(vectorizedString)
    .values({ value, languageId })
    .returning({ id: vectorizedString.id });

  return row.id;
};

const buildFinding = (
  overrides: Partial<NormalizedQaFinding> = {},
): NormalizedQaFinding => ({
  layer: "DETERMINISTIC",
  checkerServiceId: null,
  qaResultItemId: null,
  ruleId: "basic.number-consistency.missing",
  ruleFamily: "number",
  severity: "warning",
  action: "NEEDS_REVIEW",
  disposition: "OPEN",
  confidenceBasisPoints: 7000,
  riskScore: 65,
  message: "Number mismatch",
  explanation: null,
  sourceSpan: null,
  targetSpan: null,
  suggestedText: null,
  meta: null,
  ...overrides,
});

const seedReviewTarget = async (label: string) => {
  const project = await executeCommand({ db: testDb.client }, createProject, {
    name: `qa-review-${label}-${randomUUID()}`,
    description: null,
    creatorId,
  });
  const root = await executeCommand(
    { db: testDb.client },
    createRootContentNode,
    { projectId: project.id, creatorId },
  );
  const file = await executeCommand(
    { db: testDb.client },
    createContentNodeUnderParent,
    {
      projectId: project.id,
      creatorId,
      parentContentNodeId: root.id,
      kind: "FILE",
      displayLabel: `${label}.json`,
      importerId: "test-json",
      sourceRootRef: "root",
      stableSourceNodeRef: `${label}-file-${randomUUID()}`,
      exportRole: "FILE",
      boundaryType: "FILE",
      localOrder: 0,
    },
  );
  const sourceStringId = await insertString(`${label} source`, "en");
  const [elementId] = await executeCommand(
    { db: testDb.client },
    createElements,
    {
      data: [
        {
          projectId: project.id,
          primaryContentNodeId: file.id,
          importerId: "test-json",
          sourceRootRef: "root",
          sourceNodeRef: `${label}.json`,
          stableSourceRef: `${label}-element-${randomUUID()}`,
          stringId: sourceStringId,
          localOrder: 0,
        },
      ],
    },
  );
  const translationStringId = await insertString(`${label} 译文`, "zh-Hans");
  const [translationId] = await executeCommand(
    { db: testDb.client },
    createTranslations,
    {
      data: [
        {
          translatableElementId: elementId,
          translatorId: creatorId,
          stringId: translationStringId,
        },
      ],
    },
  );

  return { project, elementId, translationId, fileId: file.id };
};

const createQueue = async (input: {
  projectId: string;
  elementId: number;
  translationId: number;
  languageId?: string;
  branchId?: number | null;
  findings: NormalizedQaFinding[];
  summary?: string;
}) => {
  const run = await executeCommand(
    { db: testDb.client },
    createQaReviewRunWithFindings,
    {
      projectId: input.projectId,
      elementId: input.elementId,
      translationId: input.translationId,
      branchId: input.branchId ?? null,
      layer: "DETERMINISTIC",
      status: "COMPLETED",
      riskScore: Math.max(
        0,
        ...input.findings.map((finding) => finding.riskScore),
      ),
      summary: input.summary ?? "QA review summary",
      findings: input.findings,
    },
  );

  const materialized = await executeCommand(
    { db: testDb.client },
    materializeQaReviewQueueItem,
    {
      projectId: input.projectId,
      languageId: input.languageId ?? "zh-Hans",
      elementId: input.elementId,
      translationId: input.translationId,
      branchId: input.branchId ?? null,
    },
  );

  return {
    queueItemId: materialized.queueItemId,
    findingIds: run.findingIds,
  };
};

const getQueueItem = async (queueItemId: number) => {
  const rows = await testDb.client
    .select({ ...getColumns(qaReviewQueueItem) })
    .from(qaReviewQueueItem)
    .where(eq(qaReviewQueueItem.id, queueItemId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new Error(`Queue item ${queueItemId} not found`);
  }

  return row;
};

beforeAll(async () => {
  testDb = await setupTestDB();
  await executeCommand({ db: testDb.client }, ensureCoreRelationTypes, {});
  await executeCommand({ db: testDb.client }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });

  const [creator, reviewerA, reviewerB] = await Promise.all([
    executeCommand({ db: testDb.client }, createUser, {
      email: `qa-review-creator-${randomUUID()}@example.com`,
      name: "QA Review Creator",
    }),
    executeCommand({ db: testDb.client }, createUser, {
      email: `qa-review-reviewer-a-${randomUUID()}@example.com`,
      name: "QA Review Reviewer A",
    }),
    executeCommand({ db: testDb.client }, createUser, {
      email: `qa-review-reviewer-b-${randomUUID()}@example.com`,
      name: "QA Review Reviewer B",
    }),
  ]);

  creatorId = creator.id;
  reviewerAId = reviewerA.id;
  reviewerBId = reviewerB.id;
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("qa review commands", () => {
  it("keeps claimed queue items claimed across re-materialization without superseding sibling candidates", async () => {
    const target = await seedReviewTarget("claim-supersede");
    const firstQueue = await createQueue({
      projectId: target.project.id,
      elementId: target.elementId,
      translationId: target.translationId,
      findings: [buildFinding()],
      summary: "First queue",
    });

    const claimed = await executeCommand(
      { db: testDb.client },
      claimQaReviewQueueItem,
      {
        queueItemId: firstQueue.queueItemId,
        userId: reviewerAId,
      },
    );
    expect(claimed.status).toBe("CLAIMED");

    const rematerialized = await executeCommand(
      { db: testDb.client },
      materializeQaReviewQueueItem,
      {
        projectId: target.project.id,
        languageId: "zh-Hans",
        elementId: target.elementId,
        translationId: target.translationId,
      },
    );
    const rematerializedQueue = await getQueueItem(rematerialized.queueItemId);
    expect(rematerializedQueue.status).toBe("CLAIMED");
    expect(rematerializedQueue.claimedBy).toBe(reviewerAId);

    const replacementStringId = await insertString(
      "claim-supersede 新译文",
      "zh-Hans",
    );
    const [replacementTranslationId] = await executeCommand(
      { db: testDb.client },
      createTranslations,
      {
        data: [
          {
            translatableElementId: target.elementId,
            translatorId: creatorId,
            stringId: replacementStringId,
          },
        ],
      },
    );
    const secondQueue = await createQueue({
      projectId: target.project.id,
      elementId: target.elementId,
      translationId: replacementTranslationId,
      findings: [buildFinding({ riskScore: 80, message: "Replacement queue" })],
      summary: "Replacement queue",
    });

    const oldQueue = await getQueueItem(firstQueue.queueItemId);
    const newQueue = await getQueueItem(secondQueue.queueItemId);

    expect(oldQueue.status).not.toBe("SUPERSEDED");
    expect(oldQueue.supersededByTranslationId).toBeNull();
    expect(newQueue.id).not.toBe(oldQueue.id);
    expect(newQueue.translationId).toBe(replacementTranslationId);
    expect(newQueue.status).not.toBe("SUPERSEDED");
  });

  it("keeps sibling candidates visible until one candidate is approved", async () => {
    const target = await seedReviewTarget("element-candidates");
    const firstQueue = await createQueue({
      projectId: target.project.id,
      elementId: target.elementId,
      translationId: target.translationId,
      findings: [buildFinding({ riskScore: 45 })],
    });
    const replacementStringId = await insertString(
      "element-candidates 替换译文",
      "zh-Hans",
    );
    const [replacementTranslationId] = await executeCommand(
      { db: testDb.client },
      createTranslations,
      {
        data: [
          {
            translatableElementId: target.elementId,
            translatorId: creatorId,
            stringId: replacementStringId,
          },
        ],
      },
    );
    const secondQueue = await createQueue({
      projectId: target.project.id,
      elementId: target.elementId,
      translationId: replacementTranslationId,
      findings: [buildFinding({ riskScore: 70 })],
    });

    expect((await getQueueItem(firstQueue.queueItemId)).status).not.toBe(
      "SUPERSEDED",
    );
    expect((await getQueueItem(secondQueue.queueItemId)).status).not.toBe(
      "SUPERSEDED",
    );

    const secondQueueRow = await getQueueItem(secondQueue.queueItemId);
    const result = await executeCommand(
      { db: testDb.client },
      submitQaReviewAction,
      {
        projectId: target.project.id,
        languageId: "zh-Hans",
        elementId: target.elementId,
        translationId: replacementTranslationId,
        queueItemId: secondQueue.queueItemId,
        action: "APPROVE",
        expectedVersion: secondQueueRow.optimisticVersion,
        noteBody: "Approve replacement",
        overrideBlocking: false,
        reviewerId: reviewerAId,
      },
    );

    expect(result.queueStatus).toBe("RESOLVED");
    expect(result.annotationId).toEqual(expect.any(Number));
    expect(result.approvedTranslationId).toBe(replacementTranslationId);
    expect(result.affectedSiblingQueueItemIds).toContain(
      firstQueue.queueItemId,
    );
    expect((await getQueueItem(firstQueue.queueItemId)).status).toBe(
      "SUPERSEDED",
    );
  });

  it("rejects and defers without changing the approved translation", async () => {
    const target = await seedReviewTarget("reject-defer");
    const rejectedQueue = await createQueue({
      projectId: target.project.id,
      elementId: target.elementId,
      translationId: target.translationId,
      findings: [buildFinding()],
    });
    const initial = await getQueueItem(rejectedQueue.queueItemId);

    const rejected = await executeCommand(
      { db: testDb.client },
      submitQaReviewAction,
      {
        projectId: target.project.id,
        languageId: "zh-Hans",
        elementId: target.elementId,
        translationId: target.translationId,
        queueItemId: rejectedQueue.queueItemId,
        action: "REJECT_CANDIDATE",
        expectedVersion: initial.optimisticVersion,
        overrideBlocking: false,
        reviewerId: reviewerAId,
      },
    );
    expect(rejected.approvedTranslationId).toBeNull();
    expect((await getQueueItem(rejectedQueue.queueItemId)).status).toBe(
      "RESOLVED",
    );

    const deferredStringId = await insertString(
      "reject-defer 延后译文",
      "zh-Hans",
    );
    const [deferredTranslationId] = await executeCommand(
      { db: testDb.client },
      createTranslations,
      {
        data: [
          {
            translatableElementId: target.elementId,
            translatorId: creatorId,
            stringId: deferredStringId,
          },
        ],
      },
    );
    const deferredQueue = await createQueue({
      projectId: target.project.id,
      elementId: target.elementId,
      translationId: deferredTranslationId,
      findings: [buildFinding({ riskScore: 55, message: "defer candidate" })],
    });
    const refreshed = await getQueueItem(deferredQueue.queueItemId);
    await executeCommand({ db: testDb.client }, submitQaReviewAction, {
      projectId: target.project.id,
      languageId: "zh-Hans",
      elementId: target.elementId,
      translationId: deferredTranslationId,
      queueItemId: deferredQueue.queueItemId,
      action: "DEFER",
      expectedVersion: refreshed.optimisticVersion,
      overrideBlocking: false,
      reviewerId: reviewerAId,
    });
    expect((await getQueueItem(deferredQueue.queueItemId)).status).not.toBe(
      "SUPERSEDED",
    );
  });

  it("transitions annotations and enforces suggestion lifecycle conflicts", async () => {
    const target = await seedReviewTarget("annotation-lifecycle");
    const { queueItemId } = await createQueue({
      projectId: target.project.id,
      elementId: target.elementId,
      translationId: target.translationId,
      findings: [buildFinding()],
    });

    const note = await executeCommand(
      { db: testDb.client },
      createQaReviewAnnotation,
      {
        queueItemId,
        intent: "NOTE",
        body: "Need more context",
        isPromotable: false,
        authorId: reviewerAId,
      },
    );

    const afterCreate = await getQueueItem(queueItemId);
    expect(afterCreate.annotationCount).toBe(1);
    expect(afterCreate.unresolvedAnnotationCount).toBe(1);

    await executeCommand({ db: testDb.client }, transitionQaReviewAnnotation, {
      annotationId: note.id,
      status: "RESOLVED",
      actorId: reviewerAId,
      reason: "Handled",
    });

    const afterTransition = await getQueueItem(queueItemId);
    expect(afterTransition.unresolvedAnnotationCount).toBe(0);

    const suggestionAnnotation = await executeCommand(
      { db: testDb.client },
      createQaReviewAnnotation,
      {
        queueItemId,
        intent: "SUGGESTION",
        body: "Use another wording",
        isPromotable: false,
        authorId: reviewerAId,
      },
    );
    const suggestion = await executeCommand(
      { db: testDb.client },
      createQaReviewSuggestion,
      {
        annotationId: suggestionAnnotation.id,
        proposedText: "annotation-lifecycle 建议",
      },
    );

    const rejected = await executeCommand(
      { db: testDb.client },
      rejectQaReviewSuggestion,
      {
        suggestionId: suggestion.id,
        rejectedBy: reviewerBId,
        rejectionReason: "Not suitable",
        expectedStatus: "OPEN",
      },
    );
    expect(rejected.status).toBe("REJECTED");

    const storedAnnotation = (
      await testDb.client
        .select({ ...getColumns(qaReviewAnnotation) })
        .from(qaReviewAnnotation)
        .where(eq(qaReviewAnnotation.id, suggestionAnnotation.id))
        .limit(1)
    )[0];
    expect(storedAnnotation.status).toBe("REJECTED");

    await expect(
      executeCommand({ db: testDb.client }, markQaReviewSuggestionApplied, {
        suggestionId: suggestion.id,
        expectedStatus: "OPEN",
        appliedTranslationId: target.translationId,
        appliedBy: reviewerAId,
      }),
    ).rejects.toMatchObject({ name: "QaReviewConflictError" });
  });

  it("requires blocker override before approving a queue with open blocking findings", async () => {
    const target = await seedReviewTarget("approve-override");
    const { queueItemId } = await createQueue({
      projectId: target.project.id,
      elementId: target.elementId,
      translationId: target.translationId,
      findings: [
        buildFinding({
          ruleId: "basic.variable-consistency.missing",
          ruleFamily: "placeholder",
          severity: "error",
          action: "BLOCK_APPROVAL",
          confidenceBasisPoints: 10000,
          riskScore: 100,
          message: "Missing placeholder",
        }),
      ],
    });

    const queueItem = await getQueueItem(queueItemId);

    await expect(
      executeCommand({ db: testDb.client }, submitQaReviewDecision, {
        queueItemId,
        decision: "APPROVE",
        reason: "Ship it",
        expectedVersion: queueItem.optimisticVersion,
        overrideBlocking: false,
        reviewerId: reviewerAId,
      }),
    ).rejects.toMatchObject({
      name: "QaReviewBlockingOverrideRequiredError",
    });

    const approvedDecision = await executeCommand(
      { db: testDb.client },
      submitQaReviewDecision,
      {
        queueItemId,
        decision: "APPROVE",
        reason: "Approved with override",
        expectedVersion: queueItem.optimisticVersion,
        overrideBlocking: true,
        reviewerId: reviewerAId,
      },
    );

    expect(approvedDecision.decision).toBe("APPROVE");
    expect((await getQueueItem(queueItemId)).status).toBe("RESOLVED");
  });

  it("closes findings and rejects stale decision versions", async () => {
    const target = await seedReviewTarget("decision-conflict");
    const queue = await createQueue({
      projectId: target.project.id,
      elementId: target.elementId,
      translationId: target.translationId,
      findings: [
        buildFinding({
          ruleId: "basic.variable-consistency.extra",
          ruleFamily: "placeholder",
          severity: "error",
          action: "BLOCK_APPROVAL",
          confidenceBasisPoints: 10000,
          riskScore: 100,
          message: "Extra placeholder",
        }),
      ],
    });
    const initialQueue = await getQueueItem(queue.queueItemId);

    const closeDecision = await executeCommand(
      { db: testDb.client },
      submitQaReviewDecision,
      {
        queueItemId: queue.queueItemId,
        decision: "CLOSE_FINDING",
        reason: "False positive after review",
        findingId: queue.findingIds[0],
        findingDisposition: "FALSE_POSITIVE",
        expectedVersion: initialQueue.optimisticVersion,
        overrideBlocking: false,
        reviewerId: reviewerAId,
      },
    );
    expect(closeDecision.decision).toBe("CLOSE_FINDING");
    expect((await getQueueItem(queue.queueItemId)).optimisticVersion).toBe(
      initialQueue.optimisticVersion + 1,
    );

    await expect(
      executeCommand({ db: testDb.client }, submitQaReviewDecision, {
        queueItemId: queue.queueItemId,
        decision: "APPROVE",
        reason: "Stale attempt",
        expectedVersion: initialQueue.optimisticVersion,
        overrideBlocking: false,
        reviewerId: reviewerBId,
      }),
    ).rejects.toMatchObject({ name: "QaReviewConflictError" });
  });
});
