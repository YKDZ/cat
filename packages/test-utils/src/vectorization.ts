import { InMemoryTaskQueue } from "@cat/core";
import {
  setVectorizationQueue,
  type VectorizationTask,
} from "@cat/server-shared";

/**
 * @zh 为测试安装一个全局内存向量化任务队列。
 * @en Install a global in-memory vectorization task queue for tests.
 *
 * @returns - {@zh 已安装的内存队列实例} {@en The installed in-memory queue instance}
 */
export const installTestVectorizationQueue =
  (): InMemoryTaskQueue<VectorizationTask> => {
    const queue = new InMemoryTaskQueue<VectorizationTask>();
    setVectorizationQueue(queue);
    return queue;
  };
