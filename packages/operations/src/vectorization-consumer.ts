import type { TaskQueue } from "@cat/core";
import type { OperationContext } from "@cat/domain";
import type { VectorizationTask } from "@cat/server-shared";

import {
  attachChunkSetToString,
  domainEvent,
  domainEventBus,
  executeCommand,
  getDbHandle,
  updateVectorizedStringStatus,
} from "@cat/domain";

import { vectorizeToChunkSetOp } from "./vectorize";

const MAX_RETRIES = 3;

/**
 * @zh 处理一批向量化队列任务：向量化 → 回填 chunkSetId → 更新状态 → 发布事件。
 * @en Process a batch of vectorization queue tasks: vectorize → backfill chunkSetId → update status → publish event.
 */
export const processVectorizationBatch = async (
  queue: TaskQueue<VectorizationTask>,
  batchSize: number,
  ctx?: OperationContext,
): Promise<void> => {
  const tasks = await queue.dequeue(batchSize);
  if (tasks.length === 0) return;

  const effectiveCtx: OperationContext = ctx ?? {
    traceId: crypto.randomUUID(),
  };

  for (const task of tasks) {
    try {
      // 1. Vectorize via plugin
      // oxlint-disable-next-line no-await-in-loop
      const { chunkSetIds } = await vectorizeToChunkSetOp(
        {
          data: task.payload.data,
          vectorizerId: task.payload.vectorizerId,
          vectorStorageId: task.payload.vectorStorageId,
        },
        effectiveCtx,
      );

      // 2. Attach chunkSetIds to strings
      // oxlint-disable-next-line no-await-in-loop
      const { client: drizzle } = await getDbHandle();
      // oxlint-disable-next-line no-await-in-loop
      await executeCommand({ db: drizzle }, attachChunkSetToString, {
        updates: task.payload.stringIds.map((sid, i) => ({
          stringId: sid,
          chunkSetId: chunkSetIds[i],
        })),
      });

      // 3. Ack + publish success
      // oxlint-disable-next-line no-await-in-loop
      await queue.ack(task.id);
      // oxlint-disable-next-line no-await-in-loop
      await domainEventBus.publish(
        domainEvent("vectorization:completed", {
          stringIds: task.payload.stringIds,
          taskId: task.payload.taskId,
        }),
      );
    } catch (error) {
      if (task.retryCount >= MAX_RETRIES - 1) {
        // Max retries reached: permanently remove from queue and mark as failed
        // oxlint-disable-next-line no-await-in-loop
        await queue.ack(task.id);
        // oxlint-disable-next-line no-await-in-loop
        const { client: drizzle } = await getDbHandle();
        // oxlint-disable-next-line no-await-in-loop
        await executeCommand({ db: drizzle }, updateVectorizedStringStatus, {
          stringIds: task.payload.stringIds,
          status: "VECTORIZE_FAILED",
        });
        // oxlint-disable-next-line no-await-in-loop
        await domainEventBus.publish(
          domainEvent("vectorization:failed", {
            stringIds: task.payload.stringIds,
            taskId: task.payload.taskId,
            error,
          }),
        );
      } else {
        // oxlint-disable-next-line no-await-in-loop
        await queue.nack(task.id);
      }
    }
  }
};
