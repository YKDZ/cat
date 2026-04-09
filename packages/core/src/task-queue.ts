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
