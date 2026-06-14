import type {
  ChatCompletionRequest,
  LLMChunk,
  LLMProvider,
} from "@cat/plugin-core";

import type { LLMPriority } from "./priority-queue.ts";

import { PriorityQueue } from "./priority-queue.ts";
import { TokenBucket } from "./token-bucket.ts";

export type { LLMPriority };

/**
 * LLMGateway initialization options.
 */
export interface LLMGatewayOptions {
  /** Underlying LLM provider plugin instance */
  provider: LLMProvider;
  /**
   * Maximum token consumption rate per second (0 = unlimited)
   */
  rateLimit?: number;
  /**
   * Token bucket burst capacity (allowed peak concurrent requests)
   */
  burstCapacity?: number;
  /**
   * Maximum concurrent LLM requests (default 1)
   */
  concurrency?: number;
}

/**
 * Options for issuing an LLM request through LLMGateway.
 */
export interface LLMGatewayRequest {
  /** Request body passed to the LLM provider */
  request: ChatCompletionRequest;
  /** Request priority (default NORMAL) */
  priority?: LLMPriority;
}

/**
 * 所有 Agent LLM 调用均通过此网关路由。
 *
 * LLM call gateway: centrally manages token-bucket rate limiting and
 * priority-queue scheduling. All agent LLM calls are routed through this gateway.
 */
export class LLMGateway {
  private readonly options: LLMGatewayOptions;
  private readonly tokenBucket: TokenBucket | null;
  private readonly queue: PriorityQueue<LLMGatewayRequest>;

  constructor(options: LLMGatewayOptions) {
    this.options = options;
    const { rateLimit = 0, burstCapacity = 10, concurrency = 1 } = options;

    this.tokenBucket =
      rateLimit > 0 ? new TokenBucket(rateLimit, burstCapacity) : null;
    this.queue = new PriorityQueue<LLMGatewayRequest>(concurrency);
  }

  /**
   * 请求会先进入优先级队列排队，然后经过令牌桶速率限制，再转发给底层 Provider。
   *
   * Issue an LLM chat request through the gateway, returning AsyncIterable<LLMChunk>.
   * The request is enqueued in the priority queue, then rate-limited by the token bucket
   * before being forwarded to the underlying provider.
   *
   * @param req - Gateway request including request body and priority
   * @returns - AsyncIterable stream of LLM response chunks
   */
  async *chat(req: LLMGatewayRequest): AsyncIterable<LLMChunk> {
    // 1. Wait for queue slot
    await this.queue.enqueue(req, req.priority ?? "NORMAL");

    try {
      // 2. Wait for token bucket
      if (this.tokenBucket) {
        await this.tokenBucket.acquire();
      }

      // 3. Forward to provider
      yield* this.options.provider.chat(req.request);
    } finally {
      // 4. Release queue slot for next request
      this.queue.release();
    }
  }
}
