import { InMemoryTaskQueue } from "@cat/core";
import {
  setVectorizationQueue,
  type VectorizationTask,
} from "@cat/server-shared";

/**
 * Install a global in-memory vectorization task queue for tests.
 *
 * @returns - The installed in-memory queue instance
 */
export const installTestVectorizationQueue =
  (): InMemoryTaskQueue<VectorizationTask> => {
    const queue = new InMemoryTaskQueue<VectorizationTask>();
    setVectorizationQueue(queue);
    return queue;
  };
