import {
  chunk,
  term,
  termConcept,
  termConceptSubject,
  translatableString,
  getDrizzleDB,
  eq,
  and,
  inArray,
} from "@cat/db";
import { PluginManager } from "@cat/plugin-core";
import { logger } from "@cat/shared/utils";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

import { spotTermOp } from "@/operations/spot-term";

/**
 * @module recognize-term
 *
 * **语义术语识别（基于向量相似度）**
 *
 * 流程：
 * 1. **发现** — 调用 spotTermOp 从文本中提取术语候选
 * 2. **向量搜索** — 将候选项向量化，然后在术语表 chunk 中进行余弦相似度搜索
 * 3. **翻译获取** — 从数据库中获取匹配术语的目标语言翻译
 *
 * @see spotTermOp — 内部使用的候选发现操作
 * @see lookupTerms — 快速词汇匹配（无需向量搜索）
 */

export const RecognizeTermInputSchema = z.object({
  termExtractorId: z.int().optional().meta({
    description:
      "Plugin service ID of the TERM_EXTRACTOR to use for candidate spotting. Omit to use the default.",
  }),
  glossaryIds: z.array(z.uuidv4()).meta({
    description: "UUIDs of glossaries to match recognized terms against.",
  }),
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  vectorSimilarityThreshold: z.number().optional().default(0.85).meta({
    description:
      "Minimum cosine similarity (0–1) required for a vector match. Default: 0.85.",
  }),
  maxVectorResults: z.int().optional().default(3).meta({
    description:
      "Maximum number of vector search results to consider per candidate. Default: 3.",
  }),
});

export const RecognizeTermOutputSchema = z.object({
  terms: z.array(
    z.object({
      term: z.string(),
      translation: z.string(),
      definition: z.string().nullable(),
    }),
  ),
});

export type RecognizeTermInput = z.infer<typeof RecognizeTermInputSchema>;
export type RecognizeTermOutput = z.infer<typeof RecognizeTermOutputSchema>;

export const recognizeTermOp = async (
  data: RecognizeTermInput,
  ctx?: OperationContext,
): Promise<RecognizeTermOutput> => {
  // Guard: Drizzle generates invalid SQL `IN ()` on empty array → hang
  if (data.glossaryIds.length === 0) return { terms: [] };

  const { client: drizzle } = await getDrizzleDB();
  const pluginManager = PluginManager.get("GLOBAL", "");

  // 1. 调用 spotTermOp 提取候选
  const candidateResult = await spotTermOp(
    {
      termExtractorId: data.termExtractorId,
      text: data.text,
      languageId: data.sourceLanguageId,
    },
    ctx,
  );

  const termCandidates = candidateResult.candidates;

  if (termCandidates.length === 0) {
    return { terms: [] };
  }

  // 2. 向量搜索
  const vectorizerEntry = pluginManager
    .getServices("TEXT_VECTORIZER")
    .find((v) => v.service.canVectorize({ languageId: data.sourceLanguageId }));
  const vectorizer = vectorizerEntry?.service;

  const storage = pluginManager.getServices("VECTOR_STORAGE")[0]?.service;

  const recognizedEntries: Array<{
    termConceptId: number;
    candidateIndex: number;
  }> = [];

  if (vectorizer && storage) {
    try {
      // 获取术语表中源语言术语的 chunk 范围
      const chunkTermRows = await drizzle
        .selectDistinct({
          chunkId: chunk.id,
          termConceptId: termConcept.id,
        })
        .from(termConcept)
        .innerJoin(term, eq(term.termConceptId, termConcept.id))
        .innerJoin(translatableString, eq(translatableString.id, term.stringId))
        .innerJoin(chunk, eq(chunk.chunkSetId, translatableString.chunkSetId))
        .where(
          and(
            inArray(termConcept.glossaryId, data.glossaryIds),
            eq(translatableString.languageId, data.sourceLanguageId),
          ),
        );

      const chunkIdRange = chunkTermRows.map((row) => row.chunkId);

      const chunkIdToTermConceptId = new Map(
        chunkTermRows.map((row) => [row.chunkId, row.termConceptId]),
      );

      if (chunkIdRange.length === 0) {
        logger.debug("WORKER", {
          msg: "No vectorized chunks found for the given glossaries and source language. Skipping vector search.",
        });
        return { terms: [] };
      }

      const uniqueTexts = Array.from(
        new Set(termCandidates.map((c) => c.text)),
      );

      const inputs = uniqueTexts.map((text) => ({
        text,
        languageId: data.sourceLanguageId,
      }));

      const vectors = await vectorizer.vectorize({
        elements: inputs,
        signal: ctx?.signal,
      });

      const textToVectorsMap = new Map<string, number[][]>();

      for (let idx = 0; idx < vectors.length; idx += 1) {
        const vectorChunks = vectors[idx];
        const text = inputs[idx]?.text;
        if (text && vectorChunks && vectorChunks.length > 0) {
          textToVectorsMap.set(
            text,
            vectorChunks.map((c) => c.vector),
          );
        }
      }

      const searchEntries = uniqueTexts
        .map((text) => ({ text, vectors: textToVectorsMap.get(text) }))
        .filter(
          (e): e is { text: string; vectors: number[][] } =>
            e.vectors !== undefined,
        );

      const searchResults = await Promise.all(
        searchEntries.map(async (entry) =>
          storage.cosineSimilarity({
            vectors: entry.vectors,
            chunkIdRange,
            minSimilarity: data.vectorSimilarityThreshold,
            maxAmount: data.maxVectorResults,
          }),
        ),
      );

      for (let i = 0; i < searchEntries.length; i += 1) {
        const entry = searchEntries[i];
        const matches = searchResults[i];
        if (!entry || !matches) continue;

        const matchingIndices = termCandidates
          .map((c, idx) => (c.text === entry.text ? idx : -1))
          .filter((idx) => idx !== -1);

        for (const match of matches) {
          const termConceptIdForChunk = chunkIdToTermConceptId.get(
            match.chunkId,
          );
          if (termConceptIdForChunk === undefined) continue;

          for (const idx of matchingIndices) {
            recognizedEntries.push({
              termConceptId: termConceptIdForChunk,
              candidateIndex: idx,
            });
          }
        }
      }
    } catch (err) {
      logger.error(
        "WORKER",
        { msg: "Vector search failed in recognize-term operation" },
        err,
      );
    }
  } else {
    logger.warn("WORKER", {
      msg: "Vector search skipped: missing vectorizer or storage service",
    });
  }

  if (recognizedEntries.length === 0) {
    return { terms: [] };
  }

  const termConceptIds = recognizedEntries.map((r) => r.termConceptId);

  // 3. 获取翻译
  const termResults = await drizzle
    .select({
      termConceptId: term.termConceptId,
      translation: translatableString.value,
      definition: termConcept.definition,
      defaultDefinition: termConceptSubject.defaultDefinition,
      conceptId: termConcept.id,
      glossaryId: termConcept.glossaryId,
    })
    .from(term)
    .innerJoin(termConcept, eq(termConcept.id, term.termConceptId))
    .innerJoin(translatableString, eq(translatableString.id, term.stringId))
    .leftJoin(
      termConceptSubject,
      eq(termConcept.subjectId, termConceptSubject.id),
    )
    .where(
      and(
        inArray(term.termConceptId, termConceptIds),
        eq(translatableString.languageId, data.translationLanguageId),
        inArray(termConcept.glossaryId, data.glossaryIds),
      ),
    );

  const resultTerms: Array<{
    term: string;
    translation: string;
    definition: string | null;
    conceptId: number;
    glossaryId: string;
  }> = [];
  const processedKeys = new Set<string>();

  for (const recog of recognizedEntries) {
    const candidate = termCandidates[recog.candidateIndex];
    const translations = termResults.filter(
      (t) => t.termConceptId === recog.termConceptId,
    );

    for (const t of translations) {
      const key = `${candidate?.text}|${t.translation}`;
      if (candidate?.text && !processedKeys.has(key)) {
        resultTerms.push({
          term: candidate.text,
          translation: t.translation,
          definition: t.definition || t.defaultDefinition,
          conceptId: t.conceptId,
          glossaryId: t.glossaryId,
        });
        processedKeys.add(key);
      }
    }
  }

  return { terms: resultTerms };
};
