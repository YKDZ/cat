/**
 * @zh LLM 请求的优先级枚举：CRITICAL > HIGH > NORMAL > LOW
 * @en Priority levels for LLM requests: CRITICAL > HIGH > NORMAL > LOW
 */
export type LLMPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";

const PRIORITY_ORDER: Record<LLMPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

interface QueueItem<T> {
  value: T;
  priority: LLMPriority;
  /** Insertion sequence number — used for same-priority FIFO ordering */
  seq: number;
  resolve: () => void;
  reject: (reason?: unknown) => void;
}

/**
 * @zh 带优先级的异步任务队列，支持 4 级优先级（CRITICAL > HIGH > NORMAL > LOW），同级先进先出。
 * @en Priority-based async task queue supporting 4 levels (CRITICAL > HIGH > NORMAL > LOW) with FIFO ordering within the same level.
 */
export class PriorityQueue<T> {
  private items: QueueItem<T>[] = [];
  private seq = 0;
  private running = 0;
  private readonly concurrency: number;

  /**
   * @zh 创建优先级队列。
   * @en Create a priority queue.
   *
   * @param concurrency - {@zh 允许同时运行的最大任务数} {@en Maximum number of concurrently running tasks}
   */
  constructor(concurrency: number = 1) {
    this.concurrency = concurrency;
  }

  /**
   * @zh 将一个值加入队列并等待其轮到执行时返回。
   * @en Enqueue a value and return a promise that resolves when it's dequeued for processing.
   *
   * @param value - {@zh 要入队的值} {@en Value to enqueue}
   * @param priority - {@zh 优先级（默认 NORMAL）} {@en Priority (default NORMAL)}
   * @returns - {@zh 当该请求出队时 resolve 的 Promise} {@en Promise that resolves when this request is dequeued}
   */
  async enqueue(value: T, priority: LLMPriority = "NORMAL"): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const item: QueueItem<T> = {
        value,
        priority,
        seq: (this.seq += 1),
        resolve,
        reject,
      };
      this.items.push(item);
      this.items.sort((a, b) => {
        const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        return pd !== 0 ? pd : a.seq - b.seq;
      });
      this.drain();
    });
  }

  /**
   * @zh 通知队列某个任务已完成，触发下一个任务出队。
   * @en Signal that a task has completed, triggering the next dequeue.
   */
  release(): void {
    this.running -= 1;
    this.drain();
  }

  private drain(): void {
    while (this.running < this.concurrency && this.items.length > 0) {
      const item = this.items.shift()!;
      this.running += 1;
      item.resolve();
    }
  }

  /** @zh 当前队列中等待的任务数 @en Number of items waiting in the queue */
  get size(): number {
    return this.items.length;
  }
}
