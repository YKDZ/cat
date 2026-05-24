import type { TaskQueue } from "@cat/core";
import type { VectorizationTask } from "@cat/server-shared";

import { isLeaseRecoverableTaskQueue } from "@cat/core";
import { domainEventBus } from "@cat/domain";
import { serverLogger } from "@cat/server-shared";

import { processVectorizationBatch } from "./vectorization-consumer";

let registered = false;

/**
 * @zh 注册向量化队列消费者，并在订阅前阻塞式恢复可回收租约。
 * @en Register the vectorization queue consumer and block on recoverable lease restoration before subscribing.
 */
export const registerVectorizationConsumer = async (
  queue: TaskQueue<VectorizationTask>,
  options?: { batchSize?: number },
): Promise<void> => {
  if (registered) return;

  if (isLeaseRecoverableTaskQueue(queue)) {
    const recovered = await queue.requeueExpiredLeases();
    serverLogger
      .withSituation("QUEUE")
      .info({ recovered }, "Recovered expired vectorization task leases");
  }

  registered = true;

  const batchSize = options?.batchSize ?? 10;

  // Event-driven: consume on enqueue notification
  domainEventBus.subscribe("vectorization:enqueued", async () => {
    await processVectorizationBatch(queue, batchSize);
  });

  // Crash recovery: drain pending tasks in the background (non-blocking)
  void (async () => {
    let pending = await queue.pendingCount();
    while (pending > 0) {
      // oxlint-disable-next-line no-await-in-loop
      await processVectorizationBatch(queue, batchSize);
      // oxlint-disable-next-line no-await-in-loop
      pending = await queue.pendingCount();
    }
  })().catch((err: unknown) => {
    serverLogger.error({ err }, "Vectorization pending drain failed");
  });
};
