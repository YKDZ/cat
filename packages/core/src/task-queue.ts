/**
 * @zh 任务队列中的一个任务。
 * @en A task in the task queue.
 */
export type QueueTask<T> = {
  /** @zh 任务唯一标识 @en Unique task identifier */
  id: string;
  /** @zh 任务负载 @en Task payload */
  payload: T;
  /** @zh 重试次数 @en Number of retries attempted */
  retryCount: number;
  /** @zh 入队时间 @en Enqueue timestamp (ISO) */
  enqueuedAt: string;
  /** @zh 当前处理租约截止时间，仅 processing 任务需要 @en Processing lease deadline, only required for processing tasks */
  leasedUntil?: string;
};

/**
 * @zh 任务队列接口——抽象入队、出队、确认、拒绝操作。
 * @en Task queue interface — abstracts enqueue, dequeue, ack, and nack operations.
 */
export type TaskQueue<T> = {
  /** @zh 批量入队任务 @en Enqueue tasks in batch */
  enqueue: (payloads: T[]) => Promise<string[]>;
  /** @zh 取出最多 maxCount 个待处理任务 @en Dequeue up to maxCount pending tasks */
  dequeue: (maxCount: number) => Promise<QueueTask<T>[]>;
  /** @zh 确认任务完成 @en Acknowledge task completion */
  ack: (taskId: string) => Promise<void>;
  /** @zh 拒绝任务（将重新入队） @en Reject task (will be re-enqueued) */
  nack: (taskId: string) => Promise<void>;
  /** @zh 获取队列中待处理任务数 @en Get pending task count */
  pendingCount: () => Promise<number>;
};

/**
 * @zh 支持租约恢复的任务队列接口。
 * @en Task queue interface that supports lease recovery.
 */
export type LeaseRecoverableTaskQueue<T> = TaskQueue<T> & {
  /** @zh 将过期 processing 租约重新放回 pending @en Requeue expired processing leases back to pending */
  requeueExpiredLeases: () => Promise<number>;
};

/**
 * @zh 判断任务队列是否支持租约恢复。
 * @en Check whether a task queue supports lease recovery.
 *
 * @param queue - {@zh 要检测的任务队列} {@en Task queue to inspect}
 * @returns - {@zh 是否支持租约恢复} {@en Whether lease recovery is supported}
 */
export const isLeaseRecoverableTaskQueue = <T>(
  queue: TaskQueue<T>,
): queue is LeaseRecoverableTaskQueue<T> => {
  return (
    typeof (queue as Partial<LeaseRecoverableTaskQueue<T>>)
      .requeueExpiredLeases === "function"
  );
};
