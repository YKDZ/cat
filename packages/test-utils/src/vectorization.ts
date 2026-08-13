import { InMemoryTaskQueue } from "@cat/core";
import {
  installVectorizationQueue,
  type VectorizationTask,
} from "@cat/server-shared";

export type TestVectorizationQueue = InMemoryTaskQueue<VectorizationTask> & {
  restore: () => void;
};

/**
 * Install a global in-memory vectorization task queue for tests.
 *
 * @returns - The installed in-memory queue instance
 */
export const installTestVectorizationQueue = (): TestVectorizationQueue => {
  const queue = new InMemoryTaskQueue<VectorizationTask>();
  return Object.assign(queue, {
    restore: installVectorizationQueue(queue),
  });
};
