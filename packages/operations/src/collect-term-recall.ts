import type { LookedUpTerm, OperationContext } from "@cat/domain";
import {
  executeQuery,
  getDbHandle,
  listLexicalTermSuggestions,
  listMorphologicalTermSuggestions,
} from "@cat/domain";
import {
  selectFirstServiceImplementation,
  resolvePluginManager,
  serverLogger as logger,
} from "@cat/server-shared";
import { ServiceImplementationReferenceSchema } from "@cat/shared";
import * as z from "zod";

import { calibrateTermBm25 } from "./confidence-calibrator/index.ts";
import { applyTermHnfPre } from "./hard-negative-filter/index.ts";
import { joinLemmas } from "./language-analysis-normalization.ts";
import { languageAnalyzeOp } from "./language-analyze.ts";
import { runPrecisionPipeline } from "./precision/precision-pipeline.ts";
import { augmentWithSparseLane } from "./precision/sparse-lane.ts";
import type {
  LookedUpTermWithPrecision,
  RawTermResult,
} from "./precision/types.ts";
import { semanticSearchTermsOp } from "./semantic-search-terms.ts";

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
  rerankProvider: ServiceImplementationReferenceSchema.optional(),
  rerankTimeoutMs: z.int().positive().default(3000),
  /** Pre-tokenized Language Analysis tokens for the source text. */
  sourceLanguageAnalysisTokens: z
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

  const analysis = await languageAnalyzeOp({ text: trimmed, languageId }, ctx);
  const contentTokens = analysis.tokens.filter(
    (token) => !token.isStop && !token.isPunct,
  );

  if (contentTokens.length === 0) {
    return trimmed.toLowerCase();
  }

  return joinLemmas(contentTokens, languageId).trim();
};

const getLanguageAnalysisContentWords = async (
  text: string,
  languageId: string,
  ctx?: OperationContext,
): Promise<string[]> => {
  const analysis = await languageAnalyzeOp({ text, languageId }, ctx);
  return analysis.tokens
    .filter((t) => !t.isStop && !t.isPunct)
    .map((t) => t.lemma.toLowerCase());
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

  const vectorizer = selectFirstServiceImplementation(
    pluginManager,
    "TEXT_VECTORIZER",
  );
  const vectorStorage = selectFirstServiceImplementation(
    pluginManager,
    "VECTOR_STORAGE",
  );

  if (vectorizer && vectorStorage) {
    tasks.push(
      semanticSearchTermsOp(
        {
          glossaryIds: input.glossaryIds,
          text: input.text,
          sourceLanguageId: input.sourceLanguageId,
          translationLanguageId: input.translationLanguageId,
          vectorizer: vectorizer.reference,
          vectorStorage: vectorStorage.reference,
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
  const contentWords = await getLanguageAnalysisContentWords(
    input.text,
    input.sourceLanguageId,
    ctx,
  );
  augmentWithSparseLane(rawTermResults, contentWords);

  // ── Confidence Calibrator ───────────────────────────────────────────
  const calSummary = calibrateTermBm25(rawTermResults);
  if (calSummary.bm25Count > 0) {
    logger
      .child({ component: "operation" })
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
    input.sourceLanguageAnalysisTokens &&
    input.sourceLanguageAnalysisTokens.length > 0
  ) {
    const hnfPreResult = applyTermHnfPre(
      rawTermResults,
      input.sourceLanguageAnalysisTokens,
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
        .child({ component: "operation" })
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
    rerankProvider: input.rerankProvider,
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
