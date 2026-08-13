import { createHash } from "node:crypto";

import type { OperationContext } from "@cat/domain";
import {
  createVectorizedStrings,
  domainEvent,
  domainEventBus,
  executeCommand,
  executeQuery,
  getDbHandle,
  listVectorizedStringsById,
} from "@cat/domain";
import { getVectorizationQueue } from "@cat/server-shared";
import {
  type UnvectorizedTextData,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";
import * as z from "zod";

export const CreateVectorizedStringInputSchema = z.object({
  data: z.array(
    z.object({
      text: z.string(),
      languageId: z.string(),
    }),
  ),
  vectorizer: ServiceImplementationReferenceSchema.optional(),
  vectorStorage: ServiceImplementationReferenceSchema.optional(),
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

const vectorizationTaskId = (
  stringIds: number[],
  data: UnvectorizedTextData[],
  vectorizer: z.infer<typeof ServiceImplementationReferenceSchema>,
  vectorStorage: z.infer<typeof ServiceImplementationReferenceSchema>,
): string => {
  const hash = createHash("sha256");
  hash.update(
    JSON.stringify([
      "vectorization-task:v1",
      stringIds,
      data.map((item) => [item.languageId, item.text]),
      [
        vectorizer.scopeType,
        vectorizer.scopeId,
        vectorizer.pluginId,
        vectorizer.serviceId,
        vectorizer.serviceType,
      ],
      [
        vectorStorage.scopeType,
        vectorStorage.scopeId,
        vectorStorage.pluginId,
        vectorStorage.serviceId,
        vectorStorage.serviceType,
      ],
    ]),
  );
  return `vectorization:v1:${hash.digest("hex")}`;
};

const createStringIdsFromData = async (
  data: UnvectorizedTextData[],
  ctx?: OperationContext,
): Promise<number[]> => {
  if (data.length === 0) return [];

  const { client: drizzle } = await getDbHandle();

  // Insert strings with status=PENDING_VECTORIZE, no chunkSetId yet
  return drizzle.transaction(async (tx) =>
    executeCommand({ db: tx }, createVectorizedStrings, {
      data,
      ...(ctx?.ownershipFence ? { ownershipFence: ctx.ownershipFence } : {}),
    }),
  );
};

/**
 *
 * 先在数据库中插入 VectorizedString 行（status=PENDING_VECTORIZE），
 * 仅当 vectorizer 与 vectorStorage 同时可用时，才会将向量化任务加入队列并发布领域事件；
 * 否则仅创建字符串记录，等待后续重向量化流程补齐。
 * Create vectorized strings and enqueue background vectorization when vector services are available.
 *
 * Inserts VectorizedString rows (status=PENDING_VECTORIZE) into the database first,
 * and only enqueues the vectorization task plus publishes a domain event when both
 * vectorizer and vectorStorage are available. Otherwise it only creates the
 * string records and leaves later re-vectorization to follow-up flows.
 *
 * @param data - String creation input parameters
 * @param ctx - Operation context
 * @returns - List of IDs of the newly created strings
 */
export const createVectorizedStringOp = async (
  data: CreateVectorizedStringInput,
  ctx?: OperationContext,
): Promise<CreateVectorizedStringOutput> => {
  if (data.data.length === 0) return { stringIds: [] };

  await ctx?.assertRunOwnership?.();
  const stringIds = await createStringIdsFromData(data.data, ctx);
  const vectorizer = data.vectorizer;
  const vectorStorage = data.vectorStorage;

  if (!vectorizer || !vectorStorage) {
    return { stringIds };
  }

  const { client: drizzle } = await getDbHandle();
  const rows = await executeQuery({ db: drizzle }, listVectorizedStringsById, {
    stringIds,
  });
  const pendingIds = new Set(
    rows
      .filter((row) => row.status === "PENDING_VECTORIZE")
      .map((row) => row.id),
  );
  const pendingEntries = stringIds.flatMap((stringId, index) => {
    const item = data.data[index];
    return pendingIds.has(stringId) && item !== undefined
      ? [{ stringId, item }]
      : [];
  });
  if (pendingEntries.length === 0) return { stringIds };

  const pendingStringIds = pendingEntries.map((entry) => entry.stringId);
  const pendingData = pendingEntries.map((entry) => entry.item);

  const queue = getVectorizationQueue();
  const taskId = vectorizationTaskId(
    pendingStringIds,
    pendingData,
    vectorizer,
    vectorStorage,
  );
  await ctx?.assertRunOwnership?.();
  await queue.enqueue(
    [
      {
        taskId,
        stringIds: pendingStringIds,
        data: pendingData,
        vectorizer,
        vectorStorage,
      },
    ],
    { taskIds: [taskId] },
  );

  // This event is an at-least-once wake-up hint. Re-publish it on a stable-ID
  // replay so a previous publish failure cannot strand the durable queue row.
  await domainEventBus.publish(
    domainEvent(
      "vectorization:enqueued",
      {
        stringIds: pendingStringIds,
        taskId,
      },
      { eventId: `${taskId}:enqueued` },
    ),
  );

  return { stringIds };
};
