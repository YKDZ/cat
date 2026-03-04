import type {
  ChatCompletionRequest,
  ChatMessage,
  LLMProvider,
} from "@cat/plugin-core";

// ─── Context Manager ───
//
// Manages message history and handles context overflow via summarization.
// User confirmed: strategy B (summarization) to align with existing agent patterns.

const SUMMARIZATION_SYSTEM_PROMPT =
  "You are a conversation summarizer. Condense the following conversation into " +
  "a concise summary that preserves all key decisions, tool results, and context " +
  "needed to continue the task. Output only the summary, no extra commentary.";

export type ContextManagerOptions = {
  /** Maximum number of messages before triggering summarization */
  maxMessages?: number;
  /** Number of recent messages to always preserve (never summarized) */
  preserveRecentCount?: number;
};

const DEFAULT_MAX_MESSAGES = 40;
const DEFAULT_PRESERVE_RECENT = 10;

/**
 * Manages the conversation context for a ReAct agent loop.
 *
 * When the message history exceeds `maxMessages`, it summarizes older messages
 * using the LLM while preserving the system prompt and recent messages.
 */
export class ContextManager {
  private messages: ChatMessage[];
  private maxMessages: number;
  private preserveRecentCount: number;

  constructor(initialMessages: ChatMessage[], options?: ContextManagerOptions) {
    this.messages = [...initialMessages];
    this.maxMessages = options?.maxMessages ?? DEFAULT_MAX_MESSAGES;
    this.preserveRecentCount =
      options?.preserveRecentCount ?? DEFAULT_PRESERVE_RECENT;
  }

  /** Get the current message history */
  getMessages = (): ChatMessage[] => {
    return [...this.messages];
  };

  /** Append a message to the history */
  push = (message: ChatMessage): void => {
    this.messages.push(message);
  };

  /** Append multiple messages */
  pushMany = (messages: ChatMessage[]): void => {
    this.messages.push(...messages);
  };

  /**
   * Append additional text to the existing system prompt (first message
   * with role "system"). If no system message exists, one is created.
   */
  appendToSystemPrompt = (text: string): void => {
    const first = this.messages[0];
    if (first?.role === "system") {
      first.content = `${first.content ?? ""}\n\n${text}`;
    } else {
      this.messages.unshift({ role: "system", content: text });
    }
  };

  /** Current message count */
  get length(): number {
    return this.messages.length;
  }

  /**
   * Check if summarization is needed, and if so, perform it.
   * Returns true if summarization was performed.
   */
  maybeSummarize = async (
    llmProvider: LLMProvider,
    signal?: AbortSignal,
  ): Promise<boolean> => {
    if (this.messages.length <= this.maxMessages) {
      return false;
    }

    // Separate system prompt (always first) from the rest
    const systemMessage =
      this.messages[0]?.role === "system" ? this.messages[0] : null;
    const nonSystemMessages = systemMessage
      ? this.messages.slice(1)
      : [...this.messages];

    // Messages to summarize vs. preserve
    const toSummarize = nonSystemMessages.slice(
      0,
      nonSystemMessages.length - this.preserveRecentCount,
    );
    const toPreserve = nonSystemMessages.slice(
      nonSystemMessages.length - this.preserveRecentCount,
    );

    if (toSummarize.length === 0) {
      return false;
    }

    // Build summarization request
    const conversationText = toSummarize
      .map((m) => `[${m.role}]: ${m.content ?? "(tool call)"}`)
      .join("\n");

    const summarizationRequest: ChatCompletionRequest = {
      messages: [
        { role: "system", content: SUMMARIZATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Summarize the following conversation:\n\n${conversationText}`,
        },
      ],
      temperature: 0.1,
      maxTokens: 1024,
      signal,
    };

    const response = await llmProvider.chat(summarizationRequest);
    const summary = response.content ?? "No summary available.";

    // Rebuild message history: system + summary + preserved recent
    const summaryMessage: ChatMessage = {
      role: "user",
      content: `[Previous conversation summary]: ${summary}`,
    };

    this.messages = [
      ...(systemMessage ? [systemMessage] : []),
      summaryMessage,
      ...toPreserve,
    ];

    return true;
  };
}
