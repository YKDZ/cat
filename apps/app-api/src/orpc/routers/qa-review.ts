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

/**
 * @zh 按项目编辑器作用域列出 QA 审校队列项。
 * @en List QA review queue items under a project editor scope.
 */
export const listQueue = authed
  .input(ListQaReviewQueueItemsQuerySchema)
  .use(checkPermission("project", "viewer"), (input) => input.projectId)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;

    return await executeQuery({ db }, listQaReviewQueueItems, input);
  });

/**
 * @zh 统计 QA 审校队列项数量。
 * @en Count QA review queue items.
 */
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

/**
 * @zh 获取单个 QA 审校队列项详情，并校验其属于请求项目。
 * @en Get a QA review queue item detail and verify it belongs to the requested project.
 */
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

/**
 * @zh 按元素聚合列出 QA 可审校集合。
 * @en List QA reviewable items aggregated by element.
 */
export const listReviewableElements = authed
  .input(ListQaReviewableElementsQuerySchema)
  .use(checkPermission("project", "viewer"), (input) => input.projectId)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;

    return await executeQuery({ db }, listQaReviewableElements, input);
  });

/**
 * @zh 统计可审校元素数量。
 * @en Count reviewable elements.
 */
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

/**
 * @zh 获取单个可审校元素详情。
 * @en Get a reviewable element detail.
 */
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

/**
 * @zh 获取首个（或下一个）可审校元素。
 * @en Get the first (or next) reviewable element.
 */
export const getFirstReviewableElement = authed
  .input(GetFirstQaReviewableElementQuerySchema)
  .use(checkPermission("project", "viewer"), (input) => input.projectId)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;

    return await executeQuery({ db }, getFirstQaReviewableElement, input);
  });

/**
 * @zh 提交 QA 工作台动作，并在分支模式下写入 translation overlay。
 * @en Submit QA workbench action and write translation overlay in branch mode.
 */
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
