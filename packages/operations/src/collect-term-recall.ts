import type { LookedUpTerm, OperationContext } from "@cat/domain";

import {
  executeQuery,
  getDbHandle,
  listLexicalTermSuggestions,
  listMorphologicalTermSuggestions,
} from "@cat/domain";
import {
  firstOrGivenService,
  resolvePluginManager,
  serverLogger as logger,
} from "@cat/server-shared";
import * as z from "zod";

import type {
  LookedUpTermWithPrecision,
  RawTermResult,
} from "./precision/types";

import { calibrateTermBm25 } from "./confidence-calibrator";
import { applyTermHnfPre } from "./hard-negative-filter";
import { joinLemmas } from "./nlp-normalization";
import { nlpSegmentOp } from "./nlp-segment";
import { runPrecisionPipeline } from "./precision/precision-pipeline";
import { augmentWithSparseLane } from "./precision/sparse-lane";
import { semanticSearchTermsOp } from "./semantic-search-terms";

export const CollectTermRecallInputSchema = z.object({
  glossaryIds: z.array(z.uuidv4()),
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  wordSimilarityThreshold: z.number().min(0).max(1).default(0.3),
  minMorphologySimilarity: z.number().min(0).max(1).default(0.7),
  minSemanticSimilarity: z.number().min(0).max(1).default(0.6),
  maxAmount: z.int().min(1).default(20),
  rerankMode: z.enum(["baseline", "reranked"]).default("reranked"),
  rerankProviderId: z.int().optional(),
  rerankTimeoutMs: z.int().positive().default(3000),
  /** Pre-tokenized NLP tokens for the source text. */
  sourceNlpTokens: z
    .array(
      z.object({
        text: z.string(),
        lemma: z.string(),
        pos: z.string(),
        start: z.int(),
        end: z.int(),
        isStop: z.boolean(),
        isPunct: z.boolean(),
      }),
    )
    .optional(),
});

export type CollectTermRecallInput = z.input<
  typeof CollectTermRecallInputSchema
>;

const normalizeRecallQuery = async (
  text: string,
  languageId: string,
  ctx?: OperationContext,
): Promise<string> => {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "";

  const segmented = await nlpSegmentOp({ text: trimmed, languageId }, ctx);
  const contentTokens = segmented.tokens.filter(
    (token) => !token.isStop && !token.isPunct,
  );

  if (contentTokens.length === 0) {
    return trimmed.toLowerCase();
  }

  return joinLemmas(contentTokens, languageId).trim();
};

const getNlpContentWords = async (
  text: string,
  languageId: string,
  ctx?: OperationContext,
): Promise<string[]> => {
  try {
    const segmented = await nlpSegmentOp({ text, languageId }, ctx);
    return segmented.tokens
      .filter((t) => !t.isStop && !t.isPunct)
      .map((t) => t.lemma.toLowerCase());
  } catch {
    return [];
  }
};

export const collectTermRecallOp = async (
  data: CollectTermRecallInput,
  ctx?: OperationContext,
): Promise<LookedUpTermWithPrecision[]> => {
  const input = CollectTermRecallInputSchema.parse(data);
  if (input.glossaryIds.length === 0) return [];

  const { client: drizzle } = await getDbHandle();
  const pluginManager = resolvePluginManager(ctx?.pluginManager);
  const normalizedText = await normalizeRecallQuery(
    input.text,
    input.sourceLanguageId,
    ctx,
  );

  const tasks: Array<Promise<LookedUpTerm[]>> = [
    executeQuery({ db: drizzle }, listLexicalTermSuggestions, {
      glossaryIds: input.glossaryIds,
      text: input.text,
      sourceLanguageId: input.sourceLanguageId,
      translationLanguageId: input.translationLanguageId,
      wordSimilarityThreshold: input.wordSimilarityThreshold,
    }),
  ];

  if (normalizedText.length > 0) {
    tasks.push(
      executeQuery({ db: drizzle }, listMorphologicalTermSuggestions, {
        glossaryIds: input.glossaryIds,
        normalizedText,
        sourceLanguageId: input.sourceLanguageId,
        translationLanguageId: input.translationLanguageId,
        minSimilarity: input.minMorphologySimilarity,
        maxAmount: input.maxAmount,
      }),
    );
  }

  const vectorizer = firstOrGivenService(pluginManager, "TEXT_VECTORIZER");
  const vectorStorage = firstOrGivenService(pluginManager, "VECTOR_STORAGE");

  if (vectorizer && vectorStorage) {
    tasks.push(
      semanticSearchTermsOp(
        {
          glossaryIds: input.glossaryIds,
          text: input.text,
          sourceLanguageId: input.sourceLanguageId,
          translationLanguageId: input.translationLanguageId,
          vectorizerId: vectorizer.id,
          vectorStorageId: vectorStorage.id,
          minSimilarity: input.minSemanticSimilarity,
          maxAmount: input.maxAmount,
        },
        ctx,
      ),
    );
  }

  const rawTermResults = (await Promise.all(tasks)).flat().map(
    (r): RawTermResult => ({
      surface: "term",
      conceptId: r.conceptId,
      glossaryId: r.glossaryId,
      term: r.term,
      translation: r.translation,
      definition: r.definition,
      confidence: r.confidence,
      matchedText: r.matchedText,
      evidences: r.evidences,
    }),
  );

  // ── Sparse Lexical Lane ───────────────────────────────────────────
  const contentWords = await getNlpContentWords(
    input.text,
    input.sourceLanguageId,
    ctx,
  );
  augmentWithSparseLane(rawTermResults, contentWords);

  // ── Confidence Calibrator ───────────────────────────────────────────
  const calSummary = calibrateTermBm25(rawTermResults);
  if (calSummary.bm25Count > 0) {
    logger
      .withSituation("OP")
      .info(
        `CAL(term): ${calSummary.bm25Count} evidences calibrated (maxRaw=${calSummary.maxRaw.toFixed(4)})`,
      );
  }

  // ── Hard-Negative Filter (pre-pipeline) ──────────────────────────────
  const hnfPreRemovals: Array<{
    surface: string;
    candidateKey: string;
    reason: string;
    stage: string;
    detail?: string;
  }> = [];

  if (
    contentWords.length > 0 &&
    input.sourceNlpTokens &&
    input.sourceNlpTokens.length > 0
  ) {
    const hnfPreResult = applyTermHnfPre(
      rawTermResults,
      input.sourceNlpTokens,
      input.text,
    );
    hnfPreRemovals.push(...hnfPreResult);

    const filtered = rawTermResults.filter(
      (r) => !(r as Record<string, unknown>)["_hnfRemoved"],
    );
    rawTermResults.length = 0;
    rawTermResults.push(...filtered);

    if (hnfPreResult.length > 0) {
      logger
        .withSituation("OP")
        .info(`HNF_pre(term): removed ${hnfPreResult.length} hard negatives`);
    }
  }

  // ── Precision Pipeline ────────────────────────────────────────────
  const ranked = await runPrecisionPipeline(rawTermResults, {
    queryText: input.text,
    maxResults: input.maxAmount,
    pluginManager,
    signal: ctx?.signal,
    rerankMode: input.rerankMode,
    rerankProviderId: input.rerankProviderId,
    rerankTimeoutMs: input.rerankTimeoutMs,
  });

  // ── Project precision-pipeline output back to LookedUpTerm shape ──
  return ranked.flatMap((c): LookedUpTermWithPrecision[] => {
    if (c.surface !== "term") return [];
    return [
      {
        term: c.term,
        translation: c.translation,
        definition: c.definition,
        conceptId: c.conceptId,
        glossaryId: c.glossaryId,
        confidence: c.confidence,
        evidences: c.evidences,
        matchedText: c.matchedText,
        rankingDecisions: c.rankingDecisions,
      },
    ];
  });
};
