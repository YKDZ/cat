export class AsyncMessageQueue<T> {
  private queue: T[] = [];
  private resolve: (() => void) | null = null;

  /**
   * Add message to queue
   * @param message Message to add
   */
  push(message: T) {
    this.queue.push(message);
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
