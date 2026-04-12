import type { OperationContext } from "@cat/domain";
import type { LookedUpTerm } from "@cat/domain";

import { AsyncMessageQueue } from "@cat/server-shared";
import { serverLogger as logger } from "@cat/server-shared";
import * as z from "zod";

import { collectTermRecallOp } from "./collect-term-recall";

export const StreamSearchTermsInputSchema = z.object({
  glossaryIds: z.array(z.string()),
  text: z.string(),
  /** Optional pre-normalized text (lemma join). If absent, falls back to lowercased text. */
  normalizedText: z.string().optional(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  minConfidence: z.number().min(0).max(1).optional().default(0.6),
  maxAmount: z.int().min(1).optional().default(20),
});

export type StreamSearchTermsInput = z.input<
  typeof StreamSearchTermsInputSchema
>;

/**
 * @zh 组合术语搜索 — 三通道流式输出。
 *
 * 同时启动三种搜索策略，结果通过 {@link AsyncMessageQueue} 以流的形式推送：
 *
 * 1. **ILIKE + word_similarity 词法匹配**（快）：基于 pg_trgm GIN 索引，几乎实时返回，先抵达。
 * 2. **形态变体匹配**（快）：基于 `TermRecallVariant.normalizedText` 的 trigram 相似度，覆盖 lemma / 折叠大小写等变体。
 * 3. **向量语义搜索**（慢）：需要向量化查询文本，若插件不可用则自动跳过。
 *
 * 三路结果按 `(term text, conceptId)` 复合键全局去重（先到先得）。
 * 返回的 `AsyncIterable` 可直接用 `for await` 消费或在 oRPC async generator 中 yield。
 * @en Combined term search with tri-channel streaming output.
 *
 * Launches three search strategies concurrently; results are pushed via
 * {@link AsyncMessageQueue}:
 *
 * 1. **ILIKE + word_similarity lexical match** (fast): backed by a pg_trgm
 *    GIN index, resolves almost instantly and arrives first.
 * 2. **Morphological variant match** (fast): trigram similarity on
 *    `TermRecallVariant.normalizedText`; covers lemma / case-folded variants.
 * 3. **Vector semantic search** (slow): requires vectorizing the query text;
 *    automatically skipped when the plugin is unavailable.
 *
 * All channels are globally deduplicated by the `(term text, conceptId)`
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
  const run = async () => {
    const terms = await collectTermRecallOp(
      {
        glossaryIds: data.glossaryIds,
        text: data.text,
        sourceLanguageId: data.sourceLanguageId,
        translationLanguageId: data.translationLanguageId,
        minSemanticSimilarity: data.minConfidence ?? 0.6,
        maxAmount: data.maxAmount ?? 20,
      },
      ctx,
    );

    for (const term of terms) {
      if (term.confidence < (data.minConfidence ?? 0.6)) continue;
      queue.push(term);
    }
  };

  void run()
    .catch((err: unknown) => {
      logger.withSituation("OP").error(err, "streamSearchTermsOp failed");
    })
    .finally(() => {
      queue.close();
    });

  return queue.consume();
};
