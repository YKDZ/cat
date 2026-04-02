import type { OperationContext } from "@cat/domain";
import type { LookedUpTerm } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import { executeQuery, listLexicalTermSuggestions } from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { firstOrGivenService } from "@cat/server-shared";
import { AsyncMessageQueue } from "@cat/server-shared";
import { serverLogger as logger } from "@cat/server-shared";
import * as z from "zod";

import { semanticSearchTermsOp } from "./semantic-search-terms";

export const StreamSearchTermsInputSchema = z.object({
  glossaryIds: z.array(z.string()),
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  minConfidence: z.number().min(0).max(1).optional().default(0.6),
  maxAmount: z.int().min(1).optional().default(20),
});

export type StreamSearchTermsInput = z.input<
  typeof StreamSearchTermsInputSchema
>;

/**
 * @zh 组合术语搜索 — 双通道流式输出。
 *
 * 同时启动两种搜索策略，结果通过 {@link AsyncMessageQueue} 以流的形式推送：
 *
 * 1. **ILIKE + word_similarity 词法匹配**（快）：基于 pg_trgm GIN 索引，几乎实时返回，先抗达。
 * 2. **向量语义搜索**（慢）：需要向量化查询文本，若插件不可用则自动跳过。
 *
 * 两路结果按 `(term text, conceptId)` 复合键全局去重（先到先得）。
 * 返回的 `AsyncIterable` 可直接用 `for await` 消费或在 oRPC async generator 中 yield。
 * @en Combined term search with dual-channel streaming output.
 *
 * Launches two search strategies concurrently; results are pushed via
 * {@link AsyncMessageQueue}:
 *
 * 1. **ILIKE + word_similarity lexical match** (fast): backed by a pg_trgm
 *    GIN index, resolves almost instantly and arrives first.
 * 2. **Vector semantic search** (slow): requires vectorizing the query text;
 *    automatically skipped when the plugin is unavailable.
 *
 * Both channels are globally deduplicated by the `(term text, conceptId)`
 * composite key (first-wins). The returned `AsyncIterable` can be consumed
 * with `for await` or yielded inside an oRPC `async function*`.
 *
 * @param data - {@zh 术语搜索输入参数} {@en Term search input parameters}
 * @param ctx - {@zh 操作上下文} {@en Operation context}
 * @returns - {@zh 异步迭代器，将依次 yield 去重后的术语匹配结果} {@en Async iterable that yields deduplicated term match results}
 */
export const streamSearchTermsOp = (
  data: StreamSearchTermsInput,
  ctx?: OperationContext,
): AsyncIterable<LookedUpTerm> => {
  const queue = new AsyncMessageQueue<LookedUpTerm>();
  // Dedup by (term text, conceptId) composite key to avoid discarding synonyms
  // within the same concept that have different text in the same language.
  const seenKeys = new Set<string>();

  const pushNew = (terms: LookedUpTerm[]) => {
    for (const t of terms) {
      const key = `${t.term}\0${t.conceptId}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      queue.push(t);
    }
  };

  const run = async () => {
    const { client: drizzle } = await getDbHandle();
    const pluginManager = PluginManager.get("GLOBAL", "");
    const vectorizer = firstOrGivenService(pluginManager, "TEXT_VECTORIZER");
    const storage = firstOrGivenService(pluginManager, "VECTOR_STORAGE");

    const minConf = data.minConfidence ?? 0.6;

    // Launch both searches concurrently; ILIKE typically resolves first.
    const tasks: Promise<void>[] = [
      executeQuery({ db: drizzle }, listLexicalTermSuggestions, {
        glossaryIds: data.glossaryIds,
        text: data.text,
        sourceLanguageId: data.sourceLanguageId,
        translationLanguageId: data.translationLanguageId,
        wordSimilarityThreshold: 0.3,
      }).then((n) => {
        pushNew(n.filter((t) => t.confidence >= minConf));
      }),
    ];

    if (vectorizer && storage) {
      tasks.push(
        semanticSearchTermsOp(
          {
            glossaryIds: data.glossaryIds,
            text: data.text,
            sourceLanguageId: data.sourceLanguageId,
            translationLanguageId: data.translationLanguageId,
            vectorizerId: vectorizer.id,
            vectorStorageId: storage.id,
            minSimilarity: data.minConfidence ?? 0.6,
            maxAmount: data.maxAmount ?? 20,
          },
          ctx,
        ).then((n) => {
          pushNew(n);
        }),
      );
    }

    await Promise.all(tasks);
  };

  void run()
    .catch((err: unknown) => {
      logger.withSituation("OP").error(err, "streamSearchTermsOp failed");
    })
    .finally(() => {
      queue.close();
    });

  // AsyncGenerator returned by .consume() implements AsyncIterable<LookedUpTerm>
  return queue.consume();
};
