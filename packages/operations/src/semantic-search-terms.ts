import type { OperationContext } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import { executeQuery, listSemanticTermSearchRange } from "@cat/domain";
import { fetchTermsByConceptIds, type LookedUpTerm } from "@cat/domain";
import {
  PluginManager,
  type TextVectorizer,
  type VectorStorage,
} from "@cat/plugin-core";
import { getServiceFromDBId } from "@cat/server-shared";
import { TermMatchSchema } from "@cat/shared";
import * as z from "zod";

export const SemanticSearchTermsInputSchema = z.object({
  glossaryIds: z.array(z.string()),
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
  minSimilarity: z.number().min(0).max(1).optional().default(0.6),
  maxAmount: z.int().min(1).optional().default(20),
});

export const SemanticSearchTermsOutputSchema = z.array(TermMatchSchema);

export type SemanticSearchTermsInput = z.infer<
  typeof SemanticSearchTermsInputSchema
>;
export type SemanticSearchTermsOutput = LookedUpTerm[];

/**
 * @zh 语义术语搜索。
 *
 * 将查询文本向量化后，在指定词汇表的已向量化 termConcept 中进行余弦相似度搜索，
 * 返回与查询语义相关的术语对列表。
 *
 * 要求每个目标 termConcept 已通过 {@link revectorizeConceptOp} 建立向量索引。
 * 若词汇表中尚无已向量化的概念，则返回空数组。
 * @en Semantic term search.
 *
 * Vectorizes the query text on the fly and performs cosine-similarity
 * search against the vectorized termConcepts in the specified glossaries,
 * returning term pairs semantically related to the query.
 *
 * Requires each target termConcept to have a vector index built via
 * {@link revectorizeConceptOp}. Returns an empty array when no
 * vectorized concepts exist in the glossaries.
 *
 * @param data - {@zh 语义搜索输入参数} {@en Semantic search input parameters}
 * @param _ctx - {@zh 操作上下文（未使用）} {@en Operation context (unused)}
 * @returns - {@zh 语义相关的术语匹配列表} {@en Semantically related term matches}
 */
export const semanticSearchTermsOp = async (
  data: SemanticSearchTermsInput,
  _ctx?: OperationContext,
): Promise<SemanticSearchTermsOutput> => {
  const { client: drizzle } = await getDbHandle();
  const pluginManager = PluginManager.get("GLOBAL", "");

  // 1. Build search range: find all chunk IDs linked to term concepts in the
  //    given glossaries that have been vectorized (stringId IS NOT NULL).
  //    Chain: termConcept.stringId → translatableString.id → chunk.chunkSetId
  const rangeRows = await executeQuery(
    { db: drizzle },
    listSemanticTermSearchRange,
    { glossaryIds: data.glossaryIds },
  );

  if (rangeRows.length === 0) return [];

  // Pre-build reverse map: chunkId → conceptId for post-search resolution.
  const chunkToConceptMap = new Map<number, number>(
    rangeRows.map((r) => [r.chunkId, r.conceptId]),
  );
  const searchRange = rangeRows.map((r) => r.chunkId);

  // 2. Vectorize the query text on-the-fly via TEXT_VECTORIZER.
  const vectorizer = getServiceFromDBId<TextVectorizer>(
    pluginManager,
    data.vectorizerId,
  );
  const queryChunks = await vectorizer.vectorize({
    elements: [{ text: data.text, languageId: data.sourceLanguageId }],
  });

  // queryChunks[0] contains all sub-chunks produced for the single input text.
  const queryVectors = (queryChunks[0] ?? []).map((c) => c.vector);
  if (queryVectors.length === 0) return [];

  // 3. Cosine similarity search within the pre-built range.
  const vectorStorage = getServiceFromDBId<VectorStorage>(
    pluginManager,
    data.vectorStorageId,
  );
  const similar = await vectorStorage.cosineSimilarity({
    vectors: queryVectors,
    chunkIdRange: searchRange,
    minSimilarity: data.minSimilarity,
    maxAmount: data.maxAmount,
  });

  if (similar.length === 0) return [];

  // 4. Map chunk IDs back to concept IDs (deduplicated, preserving similarity rank).
  //    Track the highest similarity per concept for confidence scoring.
  const seenConceptIds = new Set<number>();
  const conceptIds: number[] = [];
  const conceptSimilarityMap = new Map<number, number>();
  for (const row of similar) {
    const conceptId = chunkToConceptMap.get(row.chunkId);
    if (conceptId === undefined) continue;

    const existingSim = conceptSimilarityMap.get(conceptId);
    if (existingSim === undefined || row.similarity > existingSim) {
      conceptSimilarityMap.set(conceptId, row.similarity);
    }

    if (!seenConceptIds.has(conceptId)) {
      seenConceptIds.add(conceptId);
      conceptIds.push(conceptId);
    }
  }

  // 5. Fetch full source + translation term pairs for the matched concept IDs.
  //    Pass similarity map so each result gets its confidence from cosine similarity.
  const terms = await fetchTermsByConceptIds(
    drizzle,
    conceptIds,
    data.sourceLanguageId,
    data.translationLanguageId,
    conceptSimilarityMap,
  );

  return terms.map((term) => ({
    ...term,
    matchedText: data.text,
    evidences: [
      {
        channel: "semantic",
        matchedText: data.text,
        confidence: term.confidence,
        note: "vector similarity match",
      },
    ],
  }));
};
