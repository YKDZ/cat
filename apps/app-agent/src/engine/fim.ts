import type { FimStreamChunk, LLMProvider } from "@cat/plugin-core";

// ─── Types ───

export type FimOptions = {
  llmProvider: LLMProvider;
  systemPrompt: string;
  prefix: string;
  suffix: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  stream: boolean;
};

export type FimChunk = {
  text: string;
};

// ─── Lightweight FIM Engine ───

/**
 * Execute a single-shot streaming FIM (Fill-in-the-Middle) completion.
 *
 * Designed for ghost text and other high-frequency, low-latency scenarios.
 * No session persistence, no tool calls, no retry mechanism.
 * Yields text delta chunks as they arrive from the LLM provider.
 *
 * Callers must ensure llmProvider.supportsFim() === true.
 */
export const runFim = async function* (
  options: FimOptions,
): AsyncGenerator<FimChunk> {
  const {
    llmProvider,
    systemPrompt,
    prefix,
    suffix,
    temperature,
    maxTokens,
    signal,
    stream,
  } = options;

  if (!llmProvider.supportsFim()) {
    throw new Error(
      `LLM provider ${llmProvider.getId()} does not support FIM completions`,
    );
  }

  const chunks: FimChunk[] = [];
  let resolveNext: ((done: boolean) => void) | null = null;
  let rejected: Error | null = null;
  let done = false;

  const push = (chunk: FimChunk) => {
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

  const fimPromise = llmProvider
    .fim({
      system: systemPrompt,
      prefix,
      suffix,
      stream,
      temperature,
      maxTokens,
      signal,
      onChunk: (chunk: FimStreamChunk) => {
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

    // oxlint-disable-next-line no-await-in-loop
    await new Promise<boolean>((res) => {
      resolveNext = res;
    });
  }

  while (readIdx < chunks.length) {
    const chunk = chunks[readIdx];
    readIdx += 1;
    if (chunk !== undefined) yield chunk;
  }

  await fimPromise;
};
