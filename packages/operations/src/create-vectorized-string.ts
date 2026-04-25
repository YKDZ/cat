import type { OperationContext } from "@cat/domain";

import {
  createVectorizedStrings,
  domainEvent,
  domainEventBus,
  executeCommand,
  getDbHandle,
} from "@cat/domain";
import { getVectorizationQueue } from "@cat/server-shared";
import { UnvectorizedTextData } from "@cat/shared";
import * as z from "zod";

export const CreateVectorizedStringInputSchema = z.object({
  data: z.array(
    z.object({
      text: z.string(),
      languageId: z.string(),
    }),
  ),
  vectorizerId: z.int().optional(),
  vectorStorageId: z.int().optional(),
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
 * @zh 创建向量化字符串；若已提供向量服务，则以异步 fire-and-forget 方式排队向量化。
 *
 * 先在数据库中插入 VectorizedString 行（status=PENDING_VECTORIZE），
 * 仅当 `vectorizerId` 与 `vectorStorageId` 同时可用时，才会将向量化任务加入队列并发布领域事件；
 * 否则仅创建字符串记录，等待后续重向量化流程补齐。
 * @en Create vectorized strings and enqueue background vectorization when vector services are available.
 *
 * Inserts VectorizedString rows (status=PENDING_VECTORIZE) into the database first,
 * and only enqueues the vectorization task plus publishes a domain event when both
 * `vectorizerId` and `vectorStorageId` are available. Otherwise it only creates the
 * string records and leaves later re-vectorization to follow-up flows.
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
  const vectorizerId = data.vectorizerId;
  const vectorStorageId = data.vectorStorageId;

  if (typeof vectorizerId !== "number" || typeof vectorStorageId !== "number") {
    return { stringIds };
  }

  // Enqueue vectorization task (fire-and-forget)
  const queue = getVectorizationQueue();
  const taskId = crypto.randomUUID();
  await queue.enqueue([
    {
      taskId,
      stringIds,
      data: data.data,
      vectorizerId,
      vectorStorageId,
    },
  ]);

  // Notify consumer immediately
  await domainEventBus.publish(
    domainEvent("vectorization:enqueued", { stringIds, taskId }),
  );

  return { stringIds };
};
