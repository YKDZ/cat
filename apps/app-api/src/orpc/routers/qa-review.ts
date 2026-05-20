import {
  CountQaReviewQueueItemsQuerySchema,
  GetQaReviewQueueItemDetailQuerySchema,
  ListQaReviewQueueItemsQuerySchema,
  countQaReviewQueueItems,
  executeQuery,
  getQaReviewQueueItemDetail,
  listQaReviewQueueItems,
} from "@cat/domain";
import { ORPCError } from "@orpc/client";
import * as z from "zod";

import { authed, checkPermission } from "@/orpc/server";

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
