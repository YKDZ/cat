import type { TaskQueue } from "@cat/core";

/**
 * @zh 向量化任务的负载类型。
 * @en Payload type for a vectorization task.
 */
export type VectorizationTask = {
  taskId: string;
  stringIds: number[];
  data: Array<{ text: string; languageId: string }>;
  vectorizerId: number;
  vectorStorageId: number;
};

let queue: TaskQueue<VectorizationTask> | null = null;

/**
 * @zh 设置全局向量化任务队列实例。应在应用启动时调用一次。
 * @en Set the global vectorization task queue instance. Should be called once during app bootstrap.
 */
export const setVectorizationQueue = (
  q: TaskQueue<VectorizationTask>,
): void => {
  queue = q;
};

/**
 * @zh 获取全局向量化任务队列实例。
 * @en Get the global vectorization task queue instance.
 */
export const getVectorizationQueue = (): TaskQueue<VectorizationTask> => {
  if (!queue) {
    throw new Error(
      "Vectorization queue not initialized. Call setVectorizationQueue() first.",
    );
  }
  return queue;
};
