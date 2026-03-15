import type { ChatMessage, LLMProvider } from "@cat/plugin-core";

// ─── Types ───

export type CompletionOptions = {
  llmProvider: LLMProvider;
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
};

export type CompletionChunk = {
  text: string;
};

// ─── Lightweight Completion Engine ───

/**
 * Execute a single-shot streaming LLM completion.
 *
 * Unlike the full ReAct `runAgent()` loop, this has **no** session
 * persistence, no tool call support, and no correction retry — it is
 * designed for high-frequency, low-latency use cases such as ghost text
 * continuation suggestions.
 *
 * Yields text delta chunks as they arrive from the LLM provider.
 */
export const runCompletion = async function* (
  options: CompletionOptions,
): AsyncGenerator<CompletionChunk> {
  const {
    llmProvider,
    systemPrompt,
    userMessage,
    temperature,
    maxTokens,
    signal,
  } = options;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const chunks: CompletionChunk[] = [];
  let resolveNext: ((done: boolean) => void) | null = null;
  let rejected: Error | null = null;
  let done = false;

  const push = (chunk: CompletionChunk) => {
    chunks.push(chunk);
    resolveNext?.(false);
    resolveNext = null;
  };

  const finish = () => {
    done = true;
    resolveNext?.(false);
    resolveNext = null;
  };

  const reject = (err: unknown) => {
    rejected = err instanceof Error ? err : new Error(String(err));
    resolveNext?.(false);
    resolveNext = null;
  };

  // Start the LLM call in the background — we stream via the onChunk callback.
  const chatPromise = llmProvider
    .chat({
      messages,
      temperature,
      maxTokens,
      signal,
      onChunk: (chunk) => {
        if (chunk.type === "text_delta" && chunk.textDelta) {
          push({ text: chunk.textDelta });
        } else if (chunk.type === "done") {
          finish();
        }
      },
    })
    .then(() => {
      finish();
    })
    .catch((err: unknown) => {
      reject(err);
    });

  // Drain the chunk queue, yielding each item as it arrives.
  let readIdx = 0;
  while (true) {
    // oxlint-disable-next-line only-throw-error
    if (rejected !== null) throw rejected;

    if (readIdx < chunks.length) {
      const chunk = chunks[readIdx];
      readIdx += 1;
      if (chunk !== undefined) yield chunk;
      continue;
    }

    if (done) break;

    // Wait until more chunks arrive or the stream ends.
    // oxlint-disable-next-line no-await-in-loop
    await new Promise<boolean>((res) => {
      resolveNext = res;
    });
  }

  // Drain any remaining buffered chunks after done.
  while (readIdx < chunks.length) {
    const chunk = chunks[readIdx];
    readIdx += 1;
    if (chunk !== undefined) yield chunk;
  }

  // Ensure the underlying promise is settled before returning.
  await chatPromise;
};
