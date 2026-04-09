import type { QueueTask, TaskQueue } from "./task-queue.ts";

/**
 * @zh 基于 Map 的内存任务队列实现，满足 TaskQueue 接口（主要用于测试）。
 * @en In-memory task queue implementation backed by Map, satisfies the TaskQueue interface (primarily for testing).
 */
export class InMemoryTaskQueue<T> implements TaskQueue<T> {
  private pending: Map<string, QueueTask<T>> = new Map();
  private processing: Map<string, QueueTask<T>> = new Map();

  enqueue = async (payloads: T[]): Promise<string[]> => {
    const ids: string[] = [];
    for (const payload of payloads) {
      const id = crypto.randomUUID();
      const task: QueueTask<T> = {
        id,
        payload,
        retryCount: 0,
        enqueuedAt: new Date().toISOString(),
      };
      this.pending.set(id, task);
      ids.push(id);
    }
    return ids;
  };

  dequeue = async (maxCount: number): Promise<QueueTask<T>[]> => {
    const result: QueueTask<T>[] = [];
    const iter = this.pending.entries();
    for (let i = 0; i < maxCount; i += 1) {
      const next = iter.next();
      if (next.done) break;
      const [id, task] = next.value;
      this.pending.delete(id);
      this.processing.set(id, task);
      result.push(task);
    }
    return result;
  };

  ack = async (taskId: string): Promise<void> => {
    this.processing.delete(taskId);
  };

  nack = async (taskId: string): Promise<void> => {
    const task = this.processing.get(taskId);
    if (task) {
      this.processing.delete(taskId);
      const updated: QueueTask<T> = {
        ...task,
        retryCount: task.retryCount + 1,
      };
      this.pending.set(taskId, updated);
    }
  };

  pendingCount = async (): Promise<number> => {
    return this.pending.size;
  };
}
