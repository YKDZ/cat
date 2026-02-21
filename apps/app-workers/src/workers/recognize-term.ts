/**
 * @module recognize-term
 *
 * **Task: `term.recognize`** — Semantic Term Recognition via Vector Similarity
 *
 * Combines LLM-based candidate extraction ({@link spotTermTask}) with vector
 * similarity search to match extracted candidates against glossary entries.
 *
 * The workflow proceeds in three stages:
 * 1. **Spot** — Delegates to `term.spot` to extract term candidates from text.
 * 2. **Vector Search** — Vectorizes each unique candidate text via a
 *    {@link TextVectorizer} plugin, then queries a {@link VectorStorage}
 *    plugin for cosine similarity against all vectorized glossary entries
 *    within the specified glossaries and source language.
 * 3. **Translation Fetch** — Resolves matched term entry IDs back to their
 *    translations in the target language from the database.
 *
 * This task is non-deterministic (LLM output may vary) and requires active
 * LLM, vectorizer, and vector storage services. It excels at finding
 * semantically related terms that a pure lexical search would miss.
 *
 * @see {@link spotTermTask} for the candidate discovery stage used internally
 * @see {@link lookupTerms} for fast deterministic lexical matching
 */
import { defineTask } from "@/core";
import {
  chunk,
  term,
  termConcept,
  translatableString,
  getDrizzleDB,
  eq,
  and,
  inArray,
} from "@cat/db";
import { PluginManager } from "@cat/plugin-core";
import { logger } from "@cat/shared/utils";
import * as z from "zod";
import { spotTermTask } from "./spot-term.ts";

export const RecognizeTermInputSchema = z.object({
  termExtractorId: z.number().optional(),
  glossaryIds: z.array(z.string().uuid()),
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  vectorSimilarityThreshold: z.number().optional().default(0.85),
  maxVectorResults: z.number().optional().default(3),
});

export const RecognizeTermOutputSchema = z.object({
  terms: z.array(
    z.object({
      term: z.string(),
      translation: z.string(),
      definition: z.string(),
    }),
  ),
});

export const recognizeTermTask = await defineTask({
  name: "term.recognize",
  input: RecognizeTermInputSchema,
  output: RecognizeTermOutputSchema,

  handler: async (data, ctx) => {
    const { client: drizzle } = await getDrizzleDB();
    const pluginManager = PluginManager.get("GLOBAL", "");

    // 1. Extract candidates from text via the dedicated candidate extraction task
    const candidateResult = await spotTermTask.handler(
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

    // Fallback/Default implementation logic - Vector Search
    const vectorizerEntry = pluginManager
      .getServices("TEXT_VECTORIZER")
      .find((v) =>
        v.service.canVectorize({ languageId: data.sourceLanguageId }),
      );
    const vectorizer = vectorizerEntry?.service;

    const storage = pluginManager.getServices("VECTOR_STORAGE")[0]?.service;

    const recognizedEntries: Array<{
      termConceptId: number;
      candidateIndex: number;
    }> = [];

    // 2. Perform Vector Search (Default Implementation)
    if (vectorizer && storage) {
      try {
        // Resolve the search range: all chunk IDs belonging to source-language
        // terms in the target glossaries, along with a chunkId → termConceptId map.
        // Relation chain: termConcept → Term → TranslatableString → ChunkSet → Chunk
        const chunkTermRows = await drizzle
          .selectDistinct({
            chunkId: chunk.id,
            termConceptId: termConcept.id,
          })
          .from(termConcept)
          .innerJoin(term, eq(term.termConceptId, termConcept.id))
          .innerJoin(
            translatableString,
            eq(translatableString.id, term.stringId),
          )
          .innerJoin(chunk, eq(chunk.chunkSetId, translatableString.chunkSetId))
          .where(
            and(
              inArray(termConcept.glossaryId, data.glossaryIds),
              eq(translatableString.languageId, data.sourceLanguageId),
            ),
          );

        const chunkIdRange = chunkTermRows.map((row) => row.chunkId);

        // Map from chunk ID back to term entry ID for result resolution
        const chunkIdTotermConceptId = new Map(
          chunkTermRows.map((row) => [row.chunkId, row.termConceptId]),
        );

        if (chunkIdRange.length === 0) {
          logger.debug("PROCESSOR", {
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

        const vectors = await vectorizer.vectorize({ elements: inputs });

        const textToVectorsMap = new Map<string, number[][]>();

        // vectorize returns VectorizedTextData[] — each element is an array of
        // {meta, vector} chunks. Every vector is related to that input element
        // and can be used for similarity search, so we keep them all.
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

        // Build search entries — filter texts that have vectors
        const searchEntries = uniqueTexts
          .map((text) => ({ text, vectors: textToVectorsMap.get(text) }))
          .filter(
            (e): e is { text: string; vectors: number[][] } =>
              e.vectors !== undefined,
          );

        // Batch all cosine similarity searches in parallel
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
            const termConceptIdForChunk = chunkIdTotermConceptId.get(
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
          "PROCESSOR",
          { msg: "Vector search failed in recognize-term task" },
          err,
        );
      }
    } else {
      logger.warn("PROCESSOR", {
        msg: "Vector search skipped: missing vectorizer or storage service",
      });
    }

    if (recognizedEntries.length === 0) {
      return { terms: [] };
    }

    const termConceptIds = recognizedEntries.map((r) => r.termConceptId);

    // 3. Fetch translations
    // Need to filter by glossary and translation language
    // Note: 'term' table structure assumed
    const termResults = await drizzle
      .select({
        termConceptId: term.termConceptId,
        translation: translatableString.value,
        definition: termConcept.definition,
      })
      .from(term)
      .innerJoin(termConcept, eq(termConcept.id, term.termConceptId))
      .innerJoin(translatableString, eq(translatableString.id, term.stringId))
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
      definition: string;
    }> = [];
    const processedKeys = new Set<string>();

    for (const recog of recognizedEntries) {
      const candidate = termCandidates[recog.candidateIndex];
      // Find all translations for this recognized term entry ID
      const translations = termResults.filter(
        (t) => t.termConceptId === recog.termConceptId,
      );

      for (const t of translations) {
        const key = `${candidate?.text}|${t.translation}`;
        if (candidate?.text && !processedKeys.has(key)) {
          resultTerms.push({
            term: candidate.text,
            translation: t.translation,
            definition: t.definition,
          });
          processedKeys.add(key);
        }
      }
    }

    return { terms: resultTerms };
  },
});
