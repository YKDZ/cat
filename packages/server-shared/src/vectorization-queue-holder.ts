import type { TaskQueue } from "@cat/core";

/**
 * Payload type for a vectorization task.
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
 * Set the global vectorization task queue instance. Should be called once during app bootstrap.
 */
export const setVectorizationQueue = (
  q: TaskQueue<VectorizationTask>,
): void => {
  queue = q;
};

/**
 * Get the global vectorization task queue instance.
 */
export const getVectorizationQueue = (): TaskQueue<VectorizationTask> => {
  if (!queue) {
    throw new Error(
      "Vectorization queue not initialized. Call setVectorizationQueue() first.",
    );
  }
  return queue;
};
