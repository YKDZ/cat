import type { OperationContext } from "@cat/domain";
import type { MemorySuggestion } from "@cat/shared/schema/misc";
import type { EnrichedTermMatch } from "@cat/shared/schema/term-recall";

import { executeQuery, getDbHandle, listNeighborElements } from "@cat/domain";
import * as z from "zod";

const SOURCE_OVERLAP_WEIGHT = 0.06;
const TARGET_OVERLAP_WEIGHT = 0.04;
const CONCEPT_OVERLAP_WEIGHT = 0.03;
const MAX_CONTEXT_WINDOW = 3;

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);

const overlapRatio = (left: string, rightTexts: string[]): number => {
  const leftTokens = new Set(tokenize(left));
  if (leftTokens.size === 0 || rightTexts.length === 0) return 0;

  let best = 0;
  for (const right of rightTexts) {
    const rightTokens = new Set(tokenize(right));
    if (rightTokens.size === 0) continue;
    let hits = 0;
    for (const token of leftTokens) {
      if (rightTokens.has(token)) hits += 1;
    }
    best = Math.max(best, hits / leftTokens.size);
  }
  return best;
};

const withRerankNote = <
  T extends { confidence: number; evidences: MemorySuggestion["evidences"] },
>(
  item: T,
  boost: number,
  notes: string[],
  fallbackChannel: MemorySuggestion["evidences"][number]["channel"],
): T => {
  if (boost <= 0 || notes.length === 0) return item;
  return {
    ...item,
    confidence: Math.min(1, item.confidence + boost),
    evidences: [
      ...item.evidences,
      {
        channel: item.evidences[0]?.channel ?? fallbackChannel,
        confidence: Math.min(1, boost),
        note: `rerank: ${notes.join("; ")}`,
      },
    ],
  };
};

const loadNeighborContext = async (elementId: number) => {
  const { client: drizzle } = await getDbHandle();
  const neighbors = await executeQuery({ db: drizzle }, listNeighborElements, {
    elementId,
    windowSize: MAX_CONTEXT_WINDOW,
  });

  return {
    neighborSources: neighbors.map((neighbor) => neighbor.value),
    neighborTranslations: neighbors
      .map((neighbor) => neighbor.approvedTranslation)
      .filter((text): text is string => text !== null),
  };
};

export const RecallContextRerankInputSchema = z.object({
  elementId: z.int(),
  queryText: z.string(),
  memories: z.array(z.any()),
});

export type RecallContextRerankInput = {
  elementId: number;
  queryText: string;
  memories: MemorySuggestion[];
};

export const TermRecallContextRerankInputSchema = z.object({
  elementId: z.int(),
  queryText: z.string(),
  terms: z.array(z.any()),
});

export type TermRecallContextRerankInput = {
  elementId: number;
  queryText: string;
  terms: EnrichedTermMatch[];
};

export const recallContextRerankOp = async (
  data: RecallContextRerankInput,
  _ctx?: OperationContext,
): Promise<MemorySuggestion[]> => {
  if (data.memories.length <= 1) return data.memories;

  const { neighborSources, neighborTranslations } = await loadNeighborContext(
    data.elementId,
  );
  const sourceContexts = [data.queryText, ...neighborSources];

  return data.memories
    .map((memory) => {
      const sourceOverlap = overlapRatio(memory.source, sourceContexts);
      const translationOverlap = overlapRatio(
        memory.translation,
        neighborTranslations,
      );
      const notes: string[] = [];
      if (sourceOverlap > 0) {
        notes.push(`neighbor source overlap +${sourceOverlap.toFixed(2)}`);
      }
      if (translationOverlap > 0) {
        notes.push(
          `approved translation overlap +${translationOverlap.toFixed(2)}`,
        );
      }
      return withRerankNote(
        memory,
        sourceOverlap * SOURCE_OVERLAP_WEIGHT +
          translationOverlap * TARGET_OVERLAP_WEIGHT,
        notes,
        "semantic",
      );
    })
    .sort((a, b) => b.confidence - a.confidence);
};

export const rerankTermRecallOp = async (
  data: TermRecallContextRerankInput,
  _ctx?: OperationContext,
): Promise<EnrichedTermMatch[]> => {
  if (data.terms.length <= 1) return data.terms;

  const { neighborSources, neighborTranslations } = await loadNeighborContext(
    data.elementId,
  );
  const sourceContexts = [data.queryText, ...neighborSources];

  return data.terms
    .map((term) => {
      const termSourceOverlap = overlapRatio(
        term.matchedText ?? term.term,
        sourceContexts,
      );
      const termTargetOverlap = overlapRatio(
        term.translation,
        neighborTranslations,
      );
      const conceptContext = [
        term.definition ?? "",
        term.concept.definition ?? "",
        ...term.concept.subjects.flatMap((subject) => [
          subject.name,
          subject.defaultDefinition ?? "",
        ]),
      ].join(" ");
      const conceptOverlap = overlapRatio(conceptContext, [data.queryText]);

      const notes: string[] = [];
      if (termSourceOverlap > 0) {
        notes.push(`query/source overlap +${termSourceOverlap.toFixed(2)}`);
      }
      if (termTargetOverlap > 0) {
        notes.push(
          `approved translation overlap +${termTargetOverlap.toFixed(2)}`,
        );
      }
      if (conceptOverlap > 0) {
        notes.push(`concept context overlap +${conceptOverlap.toFixed(2)}`);
      }

      return withRerankNote(
        term,
        termSourceOverlap * SOURCE_OVERLAP_WEIGHT +
          termTargetOverlap * TARGET_OVERLAP_WEIGHT +
          conceptOverlap * CONCEPT_OVERLAP_WEIGHT,
        notes,
        "lexical",
      );
    })
    .sort((a, b) => b.confidence - a.confidence);
};
