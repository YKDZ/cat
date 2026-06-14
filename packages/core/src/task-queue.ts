/**
 * A task in the task queue.
 */
export type QueueTask<T> = {
  /** Unique task identifier */
  id: string;
  /** Task payload */
  payload: T;
  /** Number of retries attempted */
  retryCount: number;
  /** Enqueue timestamp (ISO) */
  enqueuedAt: string;
  /** Processing lease deadline, only required for processing tasks */
  leasedUntil?: string;
};

/**
 * Task queue interface — abstracts enqueue, dequeue, ack, and nack operations.
 */
export type TaskQueue<T> = {
  /** Enqueue tasks in batch */
  enqueue: (payloads: T[]) => Promise<string[]>;
  /** Dequeue up to maxCount pending tasks */
  dequeue: (maxCount: number) => Promise<QueueTask<T>[]>;
  /** Acknowledge task completion */
  ack: (taskId: string) => Promise<void>;
  /** Reject task (will be re-enqueued) */
  nack: (taskId: string) => Promise<void>;
  /** Get pending task count */
  pendingCount: () => Promise<number>;
};

/**
 * Task queue interface that supports lease recovery.
 */
export type LeaseRecoverableTaskQueue<T> = TaskQueue<T> & {
  /** Requeue expired processing leases back to pending */
  requeueExpiredLeases: () => Promise<number>;
};

/**
 * Check whether a task queue supports lease recovery.
 *
 * @param queue - Task queue to inspect
 * @returns - Whether lease recovery is supported
 */
export const isLeaseRecoverableTaskQueue = <T>(
  queue: TaskQueue<T>,
): queue is LeaseRecoverableTaskQueue<T> => {
  return (
    typeof (queue as Partial<LeaseRecoverableTaskQueue<T>>)
      .requeueExpiredLeases === "function"
  );
};
