/**
 * @zh 双向异步通道：生产者端 push，消费者端 async iterate。
 * 基于 Promise 链实现的简单背压感知队列。
 *
 * @en Bidirectional async channel: producer pushes, consumer async-iterates.
 * A simple backpressure-aware queue built on Promise chains.
 */
export class AsyncIterableChannel<T> {
  private readonly queue: T[] = [];
  private readonly resolvers: Array<(value: IteratorResult<T>) => void> = [];
  private closed = false;

  /**
   * @zh 向通道推入一个值。通道关闭后推入会被静默忽略。
   * @en Push a value into the channel. Pushes after close are silently ignored.
   */
  push(value: T): void {
    if (this.closed) return;
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve({ value, done: false });
    } else {
      this.queue.push(value);
    }
  }

  /**
   * @zh 关闭通道。所有等待中的消费者将收到 done 信号。
   * @en Close the channel. All pending consumers receive a done signal.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const resolve of this.resolvers) {
      resolve({ value: undefined, done: true });
    }
    this.resolvers.length = 0;
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: async (): Promise<IteratorResult<T>> => {
        if (this.queue.length > 0) {
          return Promise.resolve({ value: this.queue.shift()!, done: false });
        }
        if (this.closed) {
          return Promise.resolve({
            value: undefined,
            done: true,
          });
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolvers.push(resolve);
        });
      },
    };
  }
}
