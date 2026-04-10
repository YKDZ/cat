/**
 * @zh 纯内存令牌桶，用于 LLM 请求的速率限制。
 * @en In-memory token bucket for LLM request rate limiting.
 *
 * 实现标准令牌桶算法：
 * - 令牌以固定速率（tokens/秒）补充，最大为 burstCapacity
 * - 每次请求消耗 1 个令牌；桶空时等待直到有令牌
 *
 * Implementation follows the standard token bucket algorithm:
 * - Tokens are replenished at a fixed rate (tokens/second), up to burstCapacity
 * - Each request consumes 1 token; requests wait when the bucket is empty
 */
export class TokenBucket {
  private readonly ratePerSecond: number;
  private readonly burstCapacity: number;
  private tokens: number;
  private lastRefillTime: number;

  /**
   * @zh 创建一个令牌桶实例。
   * @en Create a TokenBucket instance.
   *
   * @param ratePerSecond - {@zh 每秒补充的令牌数} {@en Tokens replenished per second}
   * @param burstCapacity - {@zh 桶的最大容量（峰值并发量）} {@en Maximum bucket capacity (burst capacity)}
   */
  constructor(ratePerSecond: number, burstCapacity: number) {
    this.ratePerSecond = ratePerSecond;
    this.burstCapacity = burstCapacity;
    this.tokens = burstCapacity;
    this.lastRefillTime = Date.now();
  }

  /**
   * @zh 尝试获取一个令牌；若桶空则等待直到有令牌可用。
   * @en Attempt to acquire one token; waits if the bucket is empty until a token becomes available.
   */
  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Calculate wait time until next token becomes available
    const waitMs = Math.ceil((1 - this.tokens) / this.ratePerSecond) * 1000;
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefillTime) / 1000;
    this.tokens = Math.min(
      this.burstCapacity,
      this.tokens + elapsed * this.ratePerSecond,
    );
    this.lastRefillTime = now;
  }
}
