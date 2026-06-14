import {
  CountQaReviewableElementsQuerySchema,
  CountQaReviewQueueItemsQuerySchema,
  GetFirstQaReviewableElementQuerySchema,
  GetQaReviewableElementDetailQuerySchema,
  GetQaReviewQueueItemDetailQuerySchema,
  ListQaReviewableElementsQuerySchema,
  ListQaReviewQueueItemsQuerySchema,
  countQaReviewableElements,
  countQaReviewQueueItems,
  executeCommand,
  executeQuery,
  getFirstQaReviewableElement,
  getQaReviewableElementDetail,
  getQaReviewQueueItemDetail,
  listQaReviewQueueItems,
  listQaReviewableElements,
  listTranslationsByIds,
  submitQaReviewAction,
} from "@cat/domain";
import { promoteApprovedTranslationMemoryOp } from "@cat/operations";
import { serverLogger as logger } from "@cat/server-shared";
import {
  QaReviewActionResultSchema,
  SubmitQaReviewActionInputSchema,
  assertSingleNonNullish,
} from "@cat/shared";
import { EditorOverlayTranslationStateSchema } from "@cat/vcs";
import { ORPCError } from "@orpc/client";
import * as z from "zod";

import { withBranchContext } from "@/orpc/middleware/with-branch-context";
import { authed, checkPermission } from "@/orpc/server";
import {
  createVCSRouteHelper,
  ensureBranchWriteContext,
} from "@/utils/vcs-route-helper";

const loadTranslationOverlayPayload = async (
  db: Parameters<typeof executeQuery>[0]["db"],
  translationId: number,
  languageId: string,
) => {
  const row = assertSingleNonNullish(
    await executeQuery({ db }, listTranslationsByIds, {
      translationIds: [translationId],
    }),
  );

  return {
    translatableElementId: row.translatableElementId,
    languageId,
    text: row.text,
    translatorId: row.translatorId,
    createdAt: row.createdAt.toISOString(),
  };
};

export const listQueue = authed
  .input(ListQaReviewQueueItemsQuerySchema)
  .use(checkPermission("project", "viewer"), (input) => input.projectId)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;

    return await executeQuery({ db }, listQaReviewQueueItems, input);
  });

export const countQueue = authed
  .input(CountQaReviewQueueItemsQuerySchema)
  .use(checkPermission("project", "viewer"), (input) => input.projectId)
  .output(z.int().min(0))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;

    return await executeQuery({ db }, countQaReviewQueueItems, input);
  });

export const getQueueItem = authed
  .input(
    GetQaReviewQueueItemDetailQuerySchema.extend({ projectId: z.uuidv4() }),
  )
  .use(checkPermission("project", "viewer"), (input) => input.projectId)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;

    const detail = await executeQuery({ db }, getQaReviewQueueItemDetail, {
      queueItemId: input.queueItemId,
    });

    if (!detail || detail.queueItem.projectId !== input.projectId) {
      throw new ORPCError("NOT_FOUND");
    }

    return detail;
  });

export const listReviewableElements = authed
  .input(ListQaReviewableElementsQuerySchema)
  .use(checkPermission("project", "viewer"), (input) => input.projectId)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;

    return await executeQuery({ db }, listQaReviewableElements, input);
  });

export const countReviewableElements = authed
  .input(CountQaReviewableElementsQuerySchema)
  .use(checkPermission("project", "viewer"), (input) => input.projectId)
  .output(z.int().min(0))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;

    return await executeQuery({ db }, countQaReviewableElements, input);
  });

export const getReviewableElement = authed
  .input(GetQaReviewableElementDetailQuerySchema)
  .use(checkPermission("project", "viewer"), (input) => input.projectId)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;

    const detail = await executeQuery(
      { db },
      getQaReviewableElementDetail,
      input,
    );
    if (!detail || detail.projectId !== input.projectId) {
      throw new ORPCError("NOT_FOUND");
    }

    return detail;
  });

export const getFirstReviewableElement = authed
  .input(GetFirstQaReviewableElementQuerySchema)
  .use(checkPermission("project", "viewer"), (input) => input.projectId)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;

    return await executeQuery({ db }, getFirstQaReviewableElement, input);
  });

export const submitAction = authed
  .input(SubmitQaReviewActionInputSchema)
  .use(checkPermission("project", "editor"), (input) => input.projectId)
  .use(withBranchContext, (input) => ({
    branchId: input.branchId ?? undefined,
    projectId: input.projectId,
  }))
  .output(QaReviewActionResultSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;

    const result = await drizzle.transaction(async (tx) => {
      const commandResult = await executeCommand(
        { db: tx },
        submitQaReviewAction,
        {
          ...input,
          branchId: input.branchId ?? null,
          reviewerId: user.id,
        },
      );

      if (input.branchId !== null && input.branchId !== undefined) {
        const branchWriteContext = await ensureBranchWriteContext({
          drizzle: tx,
          branchId: context.branchId,
          branchChangesetId: context.branchChangesetId,
          branchProjectId: context.branchProjectId,
        });

        if (!branchWriteContext) {
          throw new ORPCError("BAD_REQUEST", {
            message: "Invalid branch context for QA approval.",
          });
        }

        const { middleware } = createVCSRouteHelper(tx);
        const timestamp = new Date().toISOString();

        await Promise.all(
          commandResult.branchApprovalOverlayMutations.map(async (mutation) => {
            const translationRow = await loadTranslationOverlayPayload(
              tx,
              mutation.translationId,
              input.languageId,
            );

            await middleware.interceptWrite(
              branchWriteContext,
              "translation",
              String(mutation.translationId),
              "UPDATE",
              EditorOverlayTranslationStateSchema.parse({
                ...translationRow,
                approved: !mutation.approved,
                updatedAt: timestamp,
              }),
              EditorOverlayTranslationStateSchema.parse({
                ...translationRow,
                approved: mutation.approved,
                updatedAt: timestamp,
              }),
              async () => undefined,
            );
          }),
        );
      }

      const next = await executeQuery({ db: tx }, getFirstQaReviewableElement, {
        projectId: input.projectId,
        languageToId: input.languageId,
        branchId: input.branchId ?? undefined,
        contentNodeIds: [],
        searchQuery: "",
        statusFilter: "all",
        sortMode: "structure",
        pageSize: input.navigation?.pageSize ?? 16,
        queueFilters: {
          queueStatus: [],
          riskBucket: [],
          findingAction: [],
          includeResolved: false,
        },
        afterElementId: input.navigation?.afterElementId ?? input.elementId,
      });

      return {
        decisionId: commandResult.decisionId,
        annotationId: commandResult.annotationId,
        queueItemId: commandResult.queueItemId,
        queueStatus: commandResult.queueStatus,
        approvedTranslationId: commandResult.approvedTranslationId,
        affectedSiblingQueueItemIds: commandResult.affectedSiblingQueueItemIds,
        nextTarget: next
          ? ({ kind: "element", elementId: next.elementId } as const)
          : ({ kind: "empty" } as const),
      };
    });

    if (
      (input.branchId === null || input.branchId === undefined) &&
      result.approvedTranslationId !== null
    ) {
      try {
        await promoteApprovedTranslationMemoryOp({
          translationId: result.approvedTranslationId,
          approvedById: user.id,
        });
      } catch (error) {
        logger
          .withSituation("RPC")
          .error(
            error,
            `qa-review promotion failed: ${result.approvedTranslationId}`,
          );
      }
    }

    return result;
  });
