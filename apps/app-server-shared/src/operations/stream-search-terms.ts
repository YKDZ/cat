import { getDrizzleDB } from "@cat/db";
import { PluginManager } from "@cat/plugin-core";
import { logger } from "@cat/shared/utils";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

import { firstOrGivenService } from "@/utils";
import { AsyncMessageQueue } from "@/utils/queue";
import { lookupTerms, type LookedUpTerm } from "@/utils/term";

import { semanticSearchTermsOp } from "./semantic-search-terms";

export const StreamSearchTermsInputSchema = z.object({
  glossaryIds: z.array(z.string()),
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  minSimilarity: z.number().min(0).max(1).optional().default(0.6),
  maxAmount: z.int().min(1).optional().default(20),
});

export type StreamSearchTermsInput = z.input<
  typeof StreamSearchTermsInputSchema
>;

/**
 * 组合术语搜索 — 双通道流式输出
 *
 * 同时启动两种搜索策略，结果通过 {@link AsyncMessageQueue} 以流的形式推送：
 *
 * 1. **ILIKE 词法匹配**（快）：基于 pg_trgm GIN 索引，几乎实时返回，先抵达。
 * 2. **向量语义搜索**（慢）：需要向量化查询文本，若插件不可用则自动跳过。
 *
 * 两路结果按 conceptId 全局去重，保证调用方拿到的是唯一结果集。
 * 返回的 `AsyncIterable` 可直接用 `for await` 消费或在 oRPC `async function*` 中 yield。
 */
export const streamSearchTermsOp = (
  data: StreamSearchTermsInput,
  ctx?: OperationContext,
): AsyncIterable<LookedUpTerm> => {
  const queue = new AsyncMessageQueue<LookedUpTerm>();
  const seenConceptIds = new Set<number>();

  const pushNew = (terms: LookedUpTerm[]) => {
    for (const t of terms) {
      if (seenConceptIds.has(t.conceptId)) continue;
      seenConceptIds.add(t.conceptId);
      queue.push(t);
    }
  };

  const run = async () => {
    const { client: drizzle } = await getDrizzleDB();

    const lookupInput = {
      glossaryIds: data.glossaryIds,
      text: data.text,
      sourceLanguageId: data.sourceLanguageId,
      translationLanguageId: data.translationLanguageId,
    };

    const pluginManager = PluginManager.get("GLOBAL", "");
    const vectorizer = firstOrGivenService(pluginManager, "TEXT_VECTORIZER");
    const storage = firstOrGivenService(pluginManager, "VECTOR_STORAGE");

    // Launch both searches concurrently; ILIKE typically resolves first.
    const tasks: Promise<void>[] = [
      lookupTerms(drizzle, lookupInput).then((n) => {
        console.log("ILIKE matches found:", n);
        pushNew(n);
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
            minSimilarity: data.minSimilarity ?? 0.6,
            maxAmount: data.maxAmount ?? 20,
          },
          ctx,
        ).then((n) => {
          console.log("Semantic matches found:", n);
          pushNew(n);
        }),
      );
    }

    await Promise.all(tasks);
  };

  void run()
    .catch((err: unknown) => {
      logger.error("OP", { msg: "streamSearchTermsOp failed" }, err);
    })
    .finally(() => {
      queue.close();
    });

  // AsyncGenerator returned by .consume() implements AsyncIterable<LookedUpTerm>
  return queue.consume();
};
