import type { LookedUpTerm, OperationContext } from "@cat/domain";

import {
  executeQuery,
  getDbHandle,
  listLexicalTermSuggestions,
  listMorphologicalTermSuggestions,
} from "@cat/domain";
import { firstOrGivenService, resolvePluginManager } from "@cat/server-shared";
import * as z from "zod";

import { joinLemmas } from "./nlp-normalization";
import { nlpSegmentOp } from "./nlp-segment";
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
});

export type CollectTermRecallInput = z.input<
  typeof CollectTermRecallInputSchema
>;

const mergeTermMatches = (matches: LookedUpTerm[]): LookedUpTerm[] => {
  const merged = new Map<number, LookedUpTerm>();

  for (const match of matches) {
    const existing = merged.get(match.conceptId);
    if (!existing) {
      merged.set(match.conceptId, {
        ...match,
        evidences: [...match.evidences],
      });
      continue;
    }

    const base =
      match.confidence > existing.confidence
        ? { ...match, evidences: [...match.evidences] }
        : { ...existing, evidences: [...existing.evidences] };
    const extra = match.confidence > existing.confidence ? existing : match;
    const evidenceKey = (evidence: LookedUpTerm["evidences"][number]) =>
      [
        evidence.channel,
        evidence.matchedText ?? "",
        evidence.matchedVariantText ?? "",
        evidence.matchedVariantType ?? "",
        evidence.note ?? "",
      ].join("\0");
    const seen = new Set(base.evidences.map(evidenceKey));

    for (const evidence of extra.evidences) {
      const key = evidenceKey(evidence);
      if (seen.has(key)) continue;
      seen.add(key);
      base.evidences.push(evidence);
    }

    base.confidence = Math.max(existing.confidence, match.confidence);
    base.matchedText = base.matchedText ?? extra.matchedText;
    merged.set(match.conceptId, base);
  }

  return [...merged.values()].sort(
    (a, b) => b.confidence - a.confidence || b.term.length - a.term.length,
  );
};

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

export const collectTermRecallOp = async (
  data: CollectTermRecallInput,
  ctx?: OperationContext,
): Promise<LookedUpTerm[]> => {
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

  return mergeTermMatches((await Promise.all(tasks)).flat()).slice(
    0,
    input.maxAmount,
  );
};
