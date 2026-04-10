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
 * @zh LLMGateway 初始化选项。
 * @en LLMGateway initialization options.
 */
export interface LLMGatewayOptions {
  /** @zh 底层 LLM Provider 插件实例 @en Underlying LLM provider plugin instance */
  provider: LLMProvider;
  /**
   * @zh 每秒最大令牌消耗速率（0 表示无限制）
   * @en Maximum token consumption rate per second (0 = unlimited)
   */
  rateLimit?: number;
  /**
   * @zh 令牌桶突发容量（允许的峰值并发请求数）
   * @en Token bucket burst capacity (allowed peak concurrent requests)
   */
  burstCapacity?: number;
  /**
   * @zh 最大同时并发 LLM 请求数（默认 1）
   * @en Maximum concurrent LLM requests (default 1)
   */
  concurrency?: number;
}

/**
 * @zh 通过 LLMGateway 发出 LLM 请求的选项。
 * @en Options for issuing an LLM request through LLMGateway.
 */
export interface LLMGatewayRequest {
  /** @zh 传递给 LLM Provider 的请求体 @en Request body passed to the LLM provider */
  request: ChatCompletionRequest;
  /** @zh 请求优先级（默认 NORMAL）@en Request priority (default NORMAL) */
  priority?: LLMPriority;
}

/**
 * @zh LLM 调用网关：集中管理令牌桶速率限制和优先级队列调度，
 * 所有 Agent LLM 调用均通过此网关路由。
 *
 * @en LLM call gateway: centrally manages token-bucket rate limiting and
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
   * @zh 通过网关发起 LLM 对话请求，返回 AsyncIterable<LLMChunk>。
   * 请求会先进入优先级队列排队，然后经过令牌桶速率限制，再转发给底层 Provider。
   *
   * @en Issue an LLM chat request through the gateway, returning AsyncIterable<LLMChunk>.
   * The request is enqueued in the priority queue, then rate-limited by the token bucket
   * before being forwarded to the underlying provider.
   *
   * @param req - {@zh 包含请求体和优先级的网关请求} {@en Gateway request including request body and priority}
   * @returns - {@zh LLM 响应的 AsyncIterable 流} {@en AsyncIterable stream of LLM response chunks}
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
