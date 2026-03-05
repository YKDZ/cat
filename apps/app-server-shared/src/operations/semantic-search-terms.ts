import {
  and,
  chunk,
  eq,
  getDrizzleDB,
  inArray,
  isNotNull,
  termConcept,
  translatableString,
} from "@cat/db";
import {
  PluginManager,
  type TextVectorizer,
  type VectorStorage,
} from "@cat/plugin-core";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

import { getServiceFromDBId } from "@/utils";
import { fetchTermsByConceptIds, type LookedUpTerm } from "@/utils/term";

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

export const SemanticSearchTermsOutputSchema = z.array(
  z.object({
    term: z.string(),
    translation: z.string(),
    definition: z.string().nullable(),
    conceptId: z.int(),
    glossaryId: z.string(),
    similarity: z.number().min(0).max(1),
  }),
);

export type SemanticSearchTermsInput = z.infer<
  typeof SemanticSearchTermsInputSchema
>;
export type SemanticSearchTermsOutput = LookedUpTerm[];

/**
 * 语义术语搜索
 *
 * 将查询文本向量化后，在指定词汇表的已向量化 termConcept 中进行余弦相似度搜索，
 * 返回与查询语义相关的术语对列表。
 *
 * 要求每个目标 termConcept 已通过 {@link revectorizeConceptOp} 建立向量索引。
 * 若词汇表中尚无已向量化的概念，则返回空数组。
 */
export const semanticSearchTermsOp = async (
  data: SemanticSearchTermsInput,
  _ctx?: OperationContext,
): Promise<SemanticSearchTermsOutput> => {
  const { client: drizzle } = await getDrizzleDB();
  const pluginManager = PluginManager.get("GLOBAL", "");

  // 1. Build search range: find all chunk IDs linked to term concepts in the
  //    given glossaries that have been vectorized (stringId IS NOT NULL).
  //    Chain: termConcept.stringId → translatableString.id → chunk.chunkSetId
  const rangeRows = await drizzle
    .selectDistinct({
      chunkId: chunk.id,
      conceptId: termConcept.id,
    })
    .from(termConcept)
    .innerJoin(
      translatableString,
      eq(translatableString.id, termConcept.stringId),
    )
    .innerJoin(chunk, eq(chunk.chunkSetId, translatableString.chunkSetId))
    .where(
      and(
        inArray(termConcept.glossaryId, data.glossaryIds),
        isNotNull(termConcept.stringId),
      ),
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
  const seenConceptIds = new Set<number>();
  const conceptIds: number[] = [];
  for (const row of similar) {
    const conceptId = chunkToConceptMap.get(row.chunkId);
    if (conceptId !== undefined && !seenConceptIds.has(conceptId)) {
      seenConceptIds.add(conceptId);
      conceptIds.push(conceptId);
    }
  }

  // 5. Fetch full source + translation term pairs for the matched concept IDs.
  return fetchTermsByConceptIds(
    drizzle,
    conceptIds,
    data.sourceLanguageId,
    data.translationLanguageId,
  );
};
