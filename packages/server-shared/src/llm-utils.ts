import type {
  ChatCompletionFinishReason,
  ChatCompletionUsage,
  LLMChunk,
  ToolCall,
} from "@cat/plugin-core";

/**
 * The complete response collected from an LLM stream.
 */
export interface CollectedLLMResponse {
  /**
   * Generated text content, or null if no text was produced.
   */
  content: string | null;
  /**
   * List of tool calls.
   */
  toolCalls: ToolCall[];
  /**
   * Token usage statistics.
   */
  usage: ChatCompletionUsage;
  /**
   * Reason the completion finished.
   */
  finishReason: ChatCompletionFinishReason;
}

/**
 *     如果流中出现 error chunk，抛出其中的 Error。
 * Consume an LLM AsyncIterable chunk stream and aggregate all chunks into
 *     a single complete response object. Throws if an error chunk is encountered.
 */
export const collectLLMResponse = async (
  stream: AsyncIterable<LLMChunk>,
): Promise<CollectedLLMResponse> => {
  let content: string | null = null;
  let finishReason: ChatCompletionFinishReason = "stop";
  let usage: ChatCompletionUsage = { promptTokens: 0, completionTokens: 0 };

  // Map from tool call index/id to accumulating data
  const toolCallMap = new Map<
    string,
    { id: string; name: string; arguments: string }
  >();

  for await (const chunk of stream) {
    switch (chunk.type) {
      case "text_delta":
        content = (content ?? "") + chunk.textDelta;
        break;

      case "thinking_delta":
        // Thinking deltas are informational; not accumulated into content
        break;

      case "tool_call_delta": {
        const { id, name, argumentsDelta } = chunk.toolCallDelta;
        const existing = toolCallMap.get(id);
        if (existing) {
          if (name) existing.name = name;
          if (argumentsDelta) existing.arguments += argumentsDelta;
        } else {
          toolCallMap.set(id, {
            id,
            name: name ?? "",
            arguments: argumentsDelta ?? "",
          });
        }
        break;
      }

      case "usage":
        usage = chunk.usage;
        break;

      case "finish":
        finishReason = chunk.finishReason;
        break;

      case "error":
        throw chunk.error;
    }
  }

  const toolCalls: ToolCall[] = [...toolCallMap.values()];

  return { content, toolCalls, usage, finishReason };
};
