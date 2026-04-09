import type { OperationContext } from "@cat/domain";

import {
  createVectorizedStrings,
  domainEvent,
  domainEventBus,
  executeCommand,
  getDbHandle,
} from "@cat/domain";
import { getVectorizationQueue } from "@cat/server-shared";
import { UnvectorizedTextData } from "@cat/shared/schema/misc";
import * as z from "zod";

export const CreateVectorizedStringInputSchema = z.object({
  data: z.array(
    z.object({
      text: z.string(),
      languageId: z.string(),
    }),
  ),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const CreateVectorizedStringOutputSchema = z.object({
  stringIds: z.array(z.int()),
});

export type CreateVectorizedStringInput = z.infer<
  typeof CreateVectorizedStringInputSchema
>;
export type CreateVectorizedStringOutput = z.infer<
  typeof CreateVectorizedStringOutputSchema
>;

const createStringIdsFromData = async (
  data: UnvectorizedTextData[],
  _ctx?: OperationContext,
): Promise<number[]> => {
  if (data.length === 0) return [];

  const { client: drizzle } = await getDbHandle();

  // Insert strings with status=PENDING_VECTORIZE, no chunkSetId yet
  return drizzle.transaction(async (tx) =>
    executeCommand({ db: tx }, createVectorizedStrings, { data }),
  );
};

/**
 * @zh 创建向量化字符串（异步 fire-and-forget 方式）。
 *
 * 先在数据库中插入 VectorizedString 行（status=PENDING_VECTORIZE），
 * 然后将向量化任务加入队列并发布领域事件，立即返回 stringIds。
 * @en Create vectorized strings (async fire-and-forget).
 *
 * Inserts VectorizedString rows (status=PENDING_VECTORIZE) into the database first,
 * then enqueues the vectorization task and publishes a domain event, returning stringIds immediately.
 *
 * @param data - {@zh 字符串创建输入参数} {@en String creation input parameters}
 * @param ctx - {@zh 操作上下文} {@en Operation context}
 * @returns - {@zh 新创建的字符串 ID 列表} {@en List of IDs of the newly created strings}
 */
export const createVectorizedStringOp = async (
  data: CreateVectorizedStringInput,
  ctx?: OperationContext,
): Promise<CreateVectorizedStringOutput> => {
  if (data.data.length === 0) return { stringIds: [] };

  const stringIds = await createStringIdsFromData(data.data, ctx);

  // Enqueue vectorization task (fire-and-forget)
  const queue = getVectorizationQueue();
  const taskId = crypto.randomUUID();
  await queue.enqueue([
    {
      taskId,
      stringIds,
      data: data.data,
      vectorizerId: data.vectorizerId,
      vectorStorageId: data.vectorStorageId,
    },
  ]);

  // Notify consumer immediately
  await domainEventBus.publish(
    domainEvent("vectorization:enqueued", { stringIds, taskId }),
  );

  return { stringIds };
};
