/**
 * Priority levels for LLM requests: CRITICAL > HIGH > NORMAL > LOW
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
 * Priority-based async task queue supporting 4 levels (CRITICAL > HIGH > NORMAL > LOW) with FIFO ordering within the same level.
 */
export class PriorityQueue<T> {
  private items: QueueItem<T>[] = [];
  private seq = 0;
  private running = 0;
  private readonly concurrency: number;

  /**
   * Create a priority queue.
   *
   * @param concurrency - Maximum number of concurrently running tasks
   */
  constructor(concurrency: number = 1) {
    this.concurrency = concurrency;
  }

  /**
   * Enqueue a value and return a promise that resolves when it's dequeued for processing.
   *
   * @param value - Value to enqueue
   * @param priority - Priority (default NORMAL)
   * @returns - Promise that resolves when this request is dequeued
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
   * Signal that a task has completed, triggering the next dequeue.
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

  /** Number of items waiting in the queue */
  get size(): number {
    return this.items.length;
  }
}
