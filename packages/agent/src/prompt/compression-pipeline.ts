import type { ChatMessage } from "@cat/plugin-core";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @zh 压缩管线配置。
 * @en Compression pipeline configuration.
 */
export interface CompressionConfig {
  /** @zh 单条 tool result 的最大 token 数 @en Max tokens for a single tool result */
  toolResultBudget: number;
  /**
   * @zh 消息总 token 数的上下文窗口限制比例（0–1）
   * @en Ratio of context window to use as the token target (0–1)
   */
  contextWindowRatio: number;
  /** @zh LLM 上下文窗口总大小（tokens）@en Total LLM context window size in tokens */
  contextWindowSize: number;
}

/**
 * @zh 压缩结果统计。
 * @en Statistics from a compression run.
 */
export interface CompressionStats {
  /** @zh 原始 token 总数 @en Original total token count */
  originalTokens: number;
  /** @zh 压缩后 token 总数 @en Compressed total token count */
  totalTokens: number;
  /** @zh 删除的 token 数 @en Number of removed tokens */
  removedTokens: number;
  /** @zh 触发的最高压缩级别（0 = 未压缩）@en Highest compression level triggered (0 = none) */
  levelReached: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TOMBSTONE = "[COMPRESSED — context omitted for brevity]";

const isToolResult = (msg: ChatMessage): boolean =>
  msg.role === "tool" || (msg as { role: string }).role === "tool_result";

const isToolCall = (msg: ChatMessage): boolean =>
  (msg as { role: string }).role === "tool_call" || "tool_calls" in msg;

const truncateContent = (msg: ChatMessage, maxTokens: number): ChatMessage => {
  const content =
    typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
  const limitChars = maxTokens * 4;
  if (content.length <= limitChars) return msg;
  return {
    ...msg,
    content: content.slice(0, limitChars) + "…[truncated]",
  };
};

const countTokens = (
  messages: ChatMessage[],
  estimateTokens: (msg: ChatMessage) => number,
): number => messages.reduce((sum, msg) => sum + estimateTokens(msg), 0);

// ─── CompressionPipeline ─────────────────────────────────────────────────────

/**
 * @zh 5 级消息压缩管线。每级压缩在前一级的基础上继续，直到 token 数满足目标。
 * thinking 内容不参与压缩（thinking 不在 messages 数组中）。
 * @en 5-level message compression pipeline. Each level builds on the previous
 * until tokens fit within the target. Thinking content is never in messages.
 */
export class CompressionPipeline {
  private readonly tokenTarget: number;

  constructor(private readonly config: CompressionConfig) {
    this.tokenTarget = Math.floor(
      config.contextWindowSize * config.contextWindowRatio,
    );
  }

  compress(
    messages: ChatMessage[],
    estimateTokens: (msg: ChatMessage) => number,
  ): { messages: ChatMessage[]; stats: CompressionStats } {
    const originalTokens = countTokens(messages, estimateTokens);

    let current = messages;
    let levelReached = 0;

    const levels: Array<(msgs: ChatMessage[]) => ChatMessage[]> = [
      (msgs) => this.toolResultBudget(msgs),
      (msgs) => this.snipCompact(msgs),
      (msgs) => this.microCompact(msgs),
      (msgs) => this.contextCollapse(msgs),
      (msgs) => this.autoCompact(msgs, estimateTokens),
    ];

    for (let i = 0; i < levels.length; i += 1) {
      const tokens = countTokens(current, estimateTokens);
      if (tokens <= this.tokenTarget) break;

      current = levels[i](current);
      levelReached = i + 1;
    }

    const totalTokens = countTokens(current, estimateTokens);

    return {
      messages: current,
      stats: {
        originalTokens,
        totalTokens,
        removedTokens: originalTokens - totalTokens,
        levelReached,
      },
    };
  }

  // ─── Level 1: Truncate over-long tool results ────────────────────────────

  private toolResultBudget(messages: ChatMessage[]): ChatMessage[] {
    return messages.map((msg) =>
      isToolResult(msg)
        ? truncateContent(msg, this.config.toolResultBudget)
        : msg,
    );
  }

  // ─── Level 2: Snip compact — keep recent K turns, tombstone older ────────

  private snipCompact(messages: ChatMessage[]): ChatMessage[] {
    // Keep system message + last 10 turns (20 messages), tombstone the rest
    const [system, ...rest] = messages;
    const systemMsg = system?.role === "system" ? system : undefined;
    const body = systemMsg ? rest : messages;

    const keepCount = Math.min(20, body.length);
    const toTombstone = body.slice(0, body.length - keepCount);
    const toKeep = body.slice(body.length - keepCount);

    if (toTombstone.length === 0) return messages;

    const tombstone: ChatMessage = {
      role: "system",
      content: `${TOMBSTONE} (${toTombstone.length} earlier messages removed)`,
    };

    return systemMsg
      ? [systemMsg, tombstone, ...toKeep]
      : [tombstone, ...toKeep];
  }

  // ─── Level 3: Micro compact — remove duplicate context refs ──────────────

  private microCompact(messages: ChatMessage[]): ChatMessage[] {
    // Deduplicate consecutive system messages by merging tombstones
    const result: ChatMessage[] = [];
    for (const msg of messages) {
      const prev = result[result.length - 1];
      if (
        prev?.role === "system" &&
        msg.role === "system" &&
        typeof prev.content === "string" &&
        prev.content.startsWith("[COMPRESSED")
      ) {
        // Merge tombstones
        result[result.length - 1] = {
          ...prev,
          content: `${TOMBSTONE} (additional context omitted)`,
        };
      } else {
        result.push(msg);
      }
    }
    return result;
  }

  // ─── Level 4: Context collapse — fold completed tool_call/tool_result pairs

  private contextCollapse(messages: ChatMessage[]): ChatMessage[] {
    return messages.filter((msg) => !isToolCall(msg) && !isToolResult(msg));
  }

  // ─── Level 5: Auto compact — remove oldest messages until under target ────

  private autoCompact(
    messages: ChatMessage[],
    estimateTokens: (msg: ChatMessage) => number,
  ): ChatMessage[] {
    const [system, ...rest] = messages;
    const systemMsg = system?.role === "system" ? system : undefined;
    let body = systemMsg ? rest : messages;

    // Remove from oldest until under target or only 2 messages remain
    while (body.length > 2) {
      const current = systemMsg ? [systemMsg, ...body] : body;
      if (countTokens(current, estimateTokens) <= this.tokenTarget) break;
      body = body.slice(1);
    }

    return systemMsg ? [systemMsg, ...body] : body;
  }
}
