import type { OperationContext } from "@cat/domain";
import type { MemorySuggestion } from "@cat/shared";
import type { EnrichedTermMatch } from "@cat/shared";

import { executeQuery, getDbHandle, listNeighborElements } from "@cat/domain";
import { resolvePluginManager } from "@cat/server-shared";
import * as z from "zod";

import { applyBandOrder } from "./rerank/apply-band-order";
import { selectContextBand } from "./rerank/context-band-selector";
import { orchestrateRerank } from "./rerank/orchestrator";

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
  rerankProviderId: z.int().optional(),
  rerankTimeoutMs: z.int().positive().optional(),
});

export type RecallContextRerankInput = {
  elementId: number;
  queryText: string;
  memories: MemorySuggestion[];
  rerankProviderId?: number;
  rerankTimeoutMs?: number;
};

export const TermRecallContextRerankInputSchema = z.object({
  elementId: z.int(),
  queryText: z.string(),
  terms: z.array(z.any()),
  rerankProviderId: z.int().optional(),
  rerankTimeoutMs: z.int().positive().optional(),
});

export type TermRecallContextRerankInput = {
  elementId: number;
  queryText: string;
  terms: EnrichedTermMatch[];
  rerankProviderId?: number;
  rerankTimeoutMs?: number;
};

export const recallContextRerankOp = async (
  data: RecallContextRerankInput,
  ctx?: OperationContext,
): Promise<MemorySuggestion[]> => {
  if (data.memories.length <= 1) return data.memories;

  let neighborSources: string[] = [];
  let neighborTranslations: string[] = [];
  try {
    const context = await loadNeighborContext(data.elementId);
    neighborSources = context.neighborSources;
    neighborTranslations = context.neighborTranslations;
  } catch {
    // Fail closed — deterministic order
    return data.memories;
  }

  const sourceContexts = [data.queryText, ...neighborSources];

  const band = selectContextBand({
    queryText: data.queryText,
    ranked: data.memories,
    getCandidateId: (m) => `memory:${m.id}`,
    getConfidence: (m) => m.confidence,
    getPositiveSignals: (m) => ({
      sourceOverlap: overlapRatio(m.source, sourceContexts),
      targetOverlap: overlapRatio(m.translation, neighborTranslations),
    }),
  });

  if (!band) return data.memories;

  const bandMemories = data.memories.slice(band.start, band.end);
  const normalized = bandMemories.map((m, index) => ({
    candidateId: `memory:${m.id}`,
    surface: "memory" as const,
    originalIndex: index,
    originalConfidence: m.confidence,
    title: m.source,
    sourceText: m.source,
    targetText: m.translation,
  }));

  const pluginManager = resolvePluginManager(ctx?.pluginManager);
  const result = await orchestrateRerank({
    request: {
      trigger: "context-route",
      surface: "memory",
      queryText: data.queryText,
      band,
      candidates: normalized,
      contextHints: {
        neighborSources,
        approvedNeighborTranslations: neighborTranslations,
      },
      rerankProviderId: data.rerankProviderId,
      timeoutMs: data.rerankTimeoutMs,
    },
    pluginManager,
    signal: ctx?.signal,
  });

  if (result.trace.outcome !== "applied") return data.memories;

  // Reorder band using returned ID order, preserving original confidence values
  const byId = new Map(data.memories.map((m) => [`memory:${m.id}`, m]));
  const reorderedBand = result.orderedCandidateIds.flatMap((id) => {
    const m = byId.get(id);
    return m ? [m] : [];
  });

  return applyBandOrder(data.memories, band, reorderedBand);
};

export const rerankTermRecallOp = async (
  data: TermRecallContextRerankInput,
  ctx?: OperationContext,
): Promise<EnrichedTermMatch[]> => {
  if (data.terms.length <= 1) return data.terms;

  let neighborSources: string[] = [];
  let neighborTranslations: string[] = [];
  try {
    const context = await loadNeighborContext(data.elementId);
    neighborSources = context.neighborSources;
    neighborTranslations = context.neighborTranslations;
  } catch {
    // Fail closed — deterministic order
    return data.terms;
  }

  const sourceContexts = [data.queryText, ...neighborSources];

  const band = selectContextBand({
    queryText: data.queryText,
    ranked: data.terms,
    getCandidateId: (t) => `term:${t.conceptId}`,
    getConfidence: (t) => t.confidence,
    getPositiveSignals: (t) => ({
      sourceOverlap: overlapRatio(t.matchedText ?? t.term, sourceContexts),
      targetOverlap: overlapRatio(t.translation, neighborTranslations),
      conceptOverlap: overlapRatio(
        [
          t.definition ?? "",
          t.concept.definition ?? "",
          ...t.concept.subjects.flatMap((s) => [
            s.name,
            s.defaultDefinition ?? "",
          ]),
        ]
          .filter(Boolean)
          .join("\n"),
        [data.queryText],
      ),
    }),
  });

  if (!band) return data.terms;

  const bandTerms = data.terms.slice(band.start, band.end);
  const normalized = bandTerms.map((term, index) => ({
    candidateId: `term:${term.conceptId}`,
    surface: "term" as const,
    originalIndex: index,
    originalConfidence: term.confidence,
    title: term.term,
    sourceText: term.matchedText ?? term.term,
    targetText: term.translation,
    definitionText: term.definition ?? undefined,
    contextText: [
      term.concept.definition ?? "",
      ...term.concept.subjects.flatMap((subject) => [
        subject.name,
        subject.defaultDefinition ?? "",
      ]),
    ]
      .filter(Boolean)
      .join("\n"),
  }));

  const pluginManager = resolvePluginManager(ctx?.pluginManager);
  const result = await orchestrateRerank({
    request: {
      trigger: "context-route",
      surface: "term",
      queryText: data.queryText,
      band,
      candidates: normalized,
      contextHints: {
        neighborSources,
        approvedNeighborTranslations: neighborTranslations,
      },
      rerankProviderId: data.rerankProviderId,
      timeoutMs: data.rerankTimeoutMs,
    },
    pluginManager,
    signal: ctx?.signal,
  });

  if (result.trace.outcome !== "applied") return data.terms;

  // Reorder band using returned ID order, preserving original confidence values
  const byId = new Map(data.terms.map((t) => [`term:${t.conceptId}`, t]));
  const reorderedBand = result.orderedCandidateIds.flatMap((id) => {
    const t = byId.get(id);
    return t ? [t] : [];
  });

  return applyBandOrder(data.terms, band, reorderedBand);
};
