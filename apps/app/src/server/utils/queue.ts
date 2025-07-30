import { redisSub } from "@cat/db";

export class AsyncMessageQueue<T> {
  private queue: T[] = [];
  private resolve: (() => void) | null = null;

  /**
   * Add message to queue
   * @param message Message to add
   */
  push(...messages: T[]) {
    this.queue.push(...messages);
    if (this.resolve) {
      this.resolve();
      this.resolve = null;
    }
  }

  /**
   * Consume the message with a async generator
   * @returns AsyncGenerator of message
   */
  async *consume(): AsyncGenerator<T, void, unknown> {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
      } else {
        await new Promise<void>((res) => (this.resolve = res));
      }
    }
  }

  /**
   * Clear queue
   */
  clear() {
    this.queue.length = 0;
    this.resolve = null;
  }
}

export function subscribeToRedisChannel(channel: string) {
  const messageQueue = new AsyncMessageQueue<string>();

  // 异步生成器接口
  const iterator: AsyncGenerator<string> = {
    [Symbol.asyncIterator]() {
      return this;
    },

    async next() {
      const gen = messageQueue.consume();
      const { value, done } = await gen.next();
      if (done || value === undefined) {
        return { value: undefined, done: true };
      }
      return { value, done: false };
    },

    async return(): Promise<IteratorResult<string>> {
      await redisSub.unsubscribe(channel);
      await redisSub.quit();
      return { value: undefined, done: true };
    },

    async throw(error?: unknown): Promise<IteratorResult<string>> {
      await redisSub.unsubscribe(channel);
      await redisSub.quit();
      return Promise.reject(error);
    },

    async [Symbol.asyncDispose]() {
      await this.return?.("");
    },
  };

  (async () => {
    await redisSub.connect();
    await redisSub.subscribe(channel, (message) => {
      messageQueue.push(message);
    });
  })();

  return iterator;
}
