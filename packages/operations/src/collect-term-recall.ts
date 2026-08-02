import type { DbHandle, LookedUpTerm, OperationContext } from "@cat/domain";
import {
  executeQuery,
  getDbHandle,
  listKeywordTermSuggestions,
  listLexicalTermSuggestions,
  listMorphologicalTermSuggestions,
  listScopedTermRecallDerivationStates,
} from "@cat/domain";
import {
  resolvePluginManager,
  selectFirstServiceImplementation,
} from "@cat/server-shared";
import type {
  CandidateChannel,
  CandidateChannelBlocker,
  CandidateChannelOutcome,
  RecallDerivationVersion,
} from "@cat/shared";
import {
  CandidateChannelRequestSchema,
  CandidateChannelValues,
  LanguageAnalysisVersionSchema,
  ServiceImplementationReferenceSchema,
  type TermRecallCandidate,
  TermRecallCandidateSchema,
  type TermRecallResult,
  TermRecallResultSchema,
} from "@cat/shared";
import * as z from "zod";

import {
  assertRecallOperationAvailable,
  createSucceededCandidateChannelOutcome,
  getCandidateRecallCandidates,
} from "./candidate-recall.ts";
import { probeGlossaryRecallDependency } from "./glossary-recall-derivation.ts";
import { applyTermHnfPre } from "./hard-negative-filter/index.ts";
import { joinLemmas } from "./language-analysis-normalization.ts";
import { LanguageAnalysisRequirementError } from "./language-analysis-requirement.ts";
import { runPrecisionPipeline } from "./precision/precision-pipeline.ts";
import type {
  LookedUpTermWithPrecision,
  RawTermResult,
} from "./precision/types.ts";
import { assessScopedRecallDerivation } from "./recall-derivation-channel.ts";
import { semanticSearchTermsOp } from "./semantic-search-terms.ts";

const LanguageAnalysisTokenSchema = z.object({
  text: z.string(),
  lemma: z.string(),
  pos: z.string(),
  start: z.int(),
  end: z.int(),
  isStop: z.boolean(),
  isPunct: z.boolean(),
});

export {
  TermRecallCandidateSchema,
  TermRecallResultSchema,
  type TermRecallCandidate,
  type TermRecallResult,
};

const containsExactTermOccurrence = (
  sourceText: string,
  termText: string,
  languageId: string,
): boolean => {
  const source = sourceText.toLocaleLowerCase(languageId);
  const term = termText.trim().toLocaleLowerCase(languageId);
  if (term.length === 0) return false;

  // ICU word spans keep Exact independent of analyzer-backed derivation while supporting no-space languages.
  const segmenter = new Intl.Segmenter(languageId, { granularity: "word" });
  const termWords = [...segmenter.segment(term)].filter(
    (segment) => segment.isWordLike,
  );
  if (termWords.length === 0) return source.includes(term);

  const sourceWords = [...segmenter.segment(source)].filter(
    (segment) => segment.isWordLike,
  );
  const sourceWordStarts = new Set(sourceWords.map((segment) => segment.index));
  const sourceWordEnds = new Set(
    sourceWords.map((segment) => segment.index + segment.segment.length),
  );
  const firstTermWord = termWords[0];
  const lastTermWord = termWords.at(-1);
  if (!firstTermWord || !lastTermWord) return false;

  for (let occurrence = source.indexOf(term); occurrence >= 0; ) {
    const firstWordStart = occurrence + firstTermWord.index;
    const lastWordEnd =
      occurrence + lastTermWord.index + lastTermWord.segment.length;
    if (
      sourceWordStarts.has(firstWordStart) &&
      sourceWordEnds.has(lastWordEnd)
    ) {
      return true;
    }
    occurrence = source.indexOf(term, occurrence + term.length);
  }
  return false;
};

export const CollectTermRecallInputSchema = z
  .object({
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
    sourceLanguageAnalysisTokens: z
      .array(LanguageAnalysisTokenSchema)
      .optional(),
    sourceLanguageAnalysisVersion: LanguageAnalysisVersionSchema.optional(),
    channels: CandidateChannelRequestSchema.default([
      ...CandidateChannelValues,
    ]),
  })
  .superRefine((input, context) => {
    if (
      (input.sourceLanguageAnalysisTokens === undefined) !==
      (input.sourceLanguageAnalysisVersion === undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourceLanguageAnalysisTokens"],
        message:
          "Language Analysis tokens and version must be supplied together.",
      });
    }
  });

export type CollectTermRecallInput = z.input<
  typeof CollectTermRecallInputSchema
>;

export const collectTermRecallOp = async (
  data: CollectTermRecallInput,
  ctx?: OperationContext,
): Promise<TermRecallResult> => {
  const input = CollectTermRecallInputSchema.parse(data);
  const requested = new Set(input.channels);
  const blockers = new Map<CandidateChannel, CandidateChannelBlocker>();
  const skips = new Map<
    CandidateChannel,
    "NOT_APPLICABLE" | "NO_SCOPED_ASSETS"
  >();

  const emptyResult = (): TermRecallResult => {
    const outcome = (
      channel: CandidateChannel,
    ): CandidateChannelOutcome<LookedUpTermWithPrecision> =>
      requested.has(channel)
        ? { status: "SKIPPED", reason: "NO_SCOPED_ASSETS" }
        : { status: "SKIPPED", reason: "NOT_REQUESTED" };
    return TermRecallResultSchema.parse({
      requestedChannels: input.channels,
      outcomes: {
        EXACT: outcome("EXACT"),
        FUZZY: outcome("FUZZY"),
        KEYWORD: outcome("KEYWORD"),
        VARIANT: outcome("VARIANT"),
        SEMANTIC: outcome("SEMANTIC"),
      },
    });
  };
  if (input.glossaryIds.length === 0) return emptyResult();

  const { client: drizzle } = await getDbHandle();
  const pluginManager = resolvePluginManager(ctx?.pluginManager);
  const staged: Record<CandidateChannel, LookedUpTerm[]> = {
    EXACT: [],
    FUZZY: [],
    KEYWORD: [],
    VARIANT: [],
    SEMANTIC: [],
  };
  let analysisTokens = input.sourceLanguageAnalysisTokens;

  const setExecutionBlocker = (
    channel: CandidateChannel,
    error: unknown,
    capability: CandidateChannelBlocker["capability"] = "DATABASE",
  ) => {
    blockers.set(channel, {
      reason: "CHANNEL_EXECUTION_FAILED",
      message: error instanceof Error ? error.message : String(error),
      retryable: true,
      capability,
    });
  };

  if (requested.has("EXACT") || requested.has("FUZZY")) {
    let lexical: LookedUpTerm[] | undefined;
    try {
      lexical = await executeQuery(
        { db: drizzle },
        listLexicalTermSuggestions,
        {
          glossaryIds: input.glossaryIds,
          text: input.text,
          sourceLanguageId: input.sourceLanguageId,
          translationLanguageId: input.translationLanguageId,
          wordSimilarityThreshold: input.wordSimilarityThreshold,
        },
      );
    } catch (error) {
      if (requested.has("EXACT")) setExecutionBlocker("EXACT", error);
      if (requested.has("FUZZY")) setExecutionBlocker("FUZZY", error);
    }
    if (lexical && requested.has("FUZZY")) {
      staged.FUZZY.push(...lexical);
    }
    if (lexical && requested.has("EXACT")) {
      try {
        staged.EXACT.push(
          ...lexical
            .filter((candidate) =>
              containsExactTermOccurrence(
                input.text,
                candidate.term,
                input.sourceLanguageId,
              ),
            )
            .map((candidate) => ({
              ...candidate,
              confidence: 1,
              evidences: [
                {
                  channel: "exact" as const,
                  matchedText: candidate.term,
                  confidence: 1,
                  note: "exact term surface occurrence",
                },
              ],
            })),
        );
      } catch (error) {
        setExecutionBlocker("EXACT", error);
      }
    }
  }

  const collectDerived = async (
    db: DbHandle,
    requiredDerivationVersion: RecallDerivationVersion,
    normalizedText: string,
    keywords: string[],
  ) => {
    if (requested.has("VARIANT") && normalizedText.length > 0) {
      try {
        staged.VARIANT.push(
          ...(await executeQuery({ db }, listMorphologicalTermSuggestions, {
            glossaryIds: input.glossaryIds,
            normalizedText,
            sourceLanguageId: input.sourceLanguageId,
            translationLanguageId: input.translationLanguageId,
            minSimilarity: input.minMorphologySimilarity,
            maxAmount: input.maxAmount,
            requiredDerivationVersion,
          })),
        );
      } catch (error) {
        setExecutionBlocker("VARIANT", error);
      }
    }
    if (requested.has("KEYWORD") && keywords.length > 0) {
      try {
        staged.KEYWORD.push(
          ...(await executeQuery({ db }, listKeywordTermSuggestions, {
            glossaryIds: input.glossaryIds,
            keywords,
            sourceLanguageId: input.sourceLanguageId,
            translationLanguageId: input.translationLanguageId,
            requiredDerivationVersion,
            maxAmount: input.maxAmount,
          })),
        );
      } catch (error) {
        setExecutionBlocker("KEYWORD", error);
      }
    }
  };

  if (requested.has("KEYWORD") || requested.has("VARIANT")) {
    try {
      const dependency = await probeGlossaryRecallDependency({
        db: drizzle,
        pluginManager,
        languageId: input.sourceLanguageId,
        text: input.text,
        languageAnalysisVersion: input.sourceLanguageAnalysisVersion,
        ctx,
      });
      analysisTokens = input.sourceLanguageAnalysisTokens ?? dependency.tokens;
      if (!analysisTokens) {
        throw new TypeError(
          "Current Language Analysis did not return tokens for Keyword Recall.",
        );
      }
      const contentTokens = analysisTokens.filter(
        (token) => !token.isStop && !token.isPunct,
      );
      const normalizedText =
        contentTokens.length > 0
          ? joinLemmas(contentTokens, input.sourceLanguageId).trim()
          : input.text.trim().toLocaleLowerCase(input.sourceLanguageId);
      const keywords = [
        ...new Set(
          contentTokens
            .map((token) => joinLemmas([token], input.sourceLanguageId).trim())
            .filter((keyword) => keyword.length > 0),
        ),
      ];

      await drizzle.transaction(
        async (tx) => {
          const states = await executeQuery(
            { db: tx },
            listScopedTermRecallDerivationStates,
            {
              glossaryIds: input.glossaryIds,
              sourceLanguageId: input.sourceLanguageId,
              translationLanguageId: input.translationLanguageId,
            },
          );
          const assessment = assessScopedRecallDerivation(
            states,
            "TERM_CONCEPT",
            dependency.requiredDerivationVersion,
          );
          if (assessment.status === "BLOCKED") {
            if (requested.has("KEYWORD")) {
              blockers.set("KEYWORD", assessment.blocker);
            }
            if (requested.has("VARIANT")) {
              blockers.set("VARIANT", assessment.blocker);
            }
            return;
          }
          if (assessment.status === "NO_SCOPED_ASSETS") {
            if (requested.has("KEYWORD")) {
              skips.set("KEYWORD", "NO_SCOPED_ASSETS");
            }
            if (requested.has("VARIANT")) {
              skips.set("VARIANT", "NO_SCOPED_ASSETS");
            }
            return;
          }
          await collectDerived(
            tx,
            dependency.requiredDerivationVersion,
            normalizedText,
            keywords,
          );
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    } catch (error) {
      const blocker: CandidateChannelBlocker =
        error instanceof LanguageAnalysisRequirementError
          ? {
              reason: "LANGUAGE_ANALYSIS_UNAVAILABLE",
              message: error.message,
              retryable: error.assessment.blocker?.retryable ?? false,
              capability: "LANGUAGE_ANALYSIS",
            }
          : {
              reason: "CHANNEL_EXECUTION_FAILED",
              message: error instanceof Error ? error.message : String(error),
              retryable: true,
              capability: "DATABASE",
            };
      if (requested.has("KEYWORD")) blockers.set("KEYWORD", blocker);
      if (requested.has("VARIANT")) blockers.set("VARIANT", blocker);
    }
  }

  if (requested.has("SEMANTIC")) {
    const vectorizer = selectFirstServiceImplementation(
      pluginManager,
      "TEXT_VECTORIZER",
    );
    const vectorStorage = selectFirstServiceImplementation(
      pluginManager,
      "VECTOR_STORAGE",
    );
    if (!vectorizer || !vectorStorage) {
      blockers.set("SEMANTIC", {
        reason: "CAPABILITY_UNAVAILABLE",
        message: vectorizer
          ? "Vector storage is unavailable for semantic recall."
          : "Text vectorization is unavailable for semantic recall.",
        retryable: false,
        capability: vectorizer ? "VECTOR_STORAGE" : "TEXT_VECTORIZER",
      });
    } else {
      try {
        staged.SEMANTIC.push(
          ...(await semanticSearchTermsOp(
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
          )),
        );
      } catch (error) {
        setExecutionBlocker("SEMANTIC", error, "VECTOR_STORAGE");
      }
    }
  }

  const collectedByKey = new Map<string, LookedUpTerm>();
  for (const channel of CandidateChannelValues) {
    if (
      !requested.has(channel) ||
      blockers.has(channel) ||
      skips.has(channel)
    ) {
      continue;
    }
    for (const candidate of staged[channel]) {
      const key = `${candidate.conceptId}\0${candidate.term}\0${candidate.translation}`;
      const existing = collectedByKey.get(key);
      if (!existing) {
        collectedByKey.set(key, candidate);
        continue;
      }
      const preferred =
        candidate.confidence > existing.confidence ? candidate : existing;
      const evidences = [...existing.evidences];
      const seenEvidence = new Set(
        evidences.map(
          (evidence) =>
            `${evidence.channel}\0${evidence.matchedText ?? ""}\0${evidence.matchedVariantText ?? ""}\0${evidence.matchedVariantType ?? ""}`,
        ),
      );
      for (const evidence of candidate.evidences) {
        const evidenceKey = `${evidence.channel}\0${evidence.matchedText ?? ""}\0${evidence.matchedVariantText ?? ""}\0${evidence.matchedVariantType ?? ""}`;
        if (seenEvidence.has(evidenceKey)) continue;
        seenEvidence.add(evidenceKey);
        evidences.push(evidence);
      }
      collectedByKey.set(key, { ...preferred, evidences });
    }
  }
  const collected = [...collectedByKey.values()];
  const raw = collected.map(
    (candidate): RawTermResult => ({
      surface: "term",
      conceptId: candidate.conceptId,
      glossaryId: candidate.glossaryId,
      term: candidate.term,
      translation: candidate.translation,
      definition: candidate.definition,
      confidence: candidate.confidence,
      matchedText: candidate.matchedText,
      evidences: candidate.evidences,
    }),
  );
  if (analysisTokens && analysisTokens.length > 0) {
    applyTermHnfPre(raw, analysisTokens, input.text);
  }
  const ranked = await runPrecisionPipeline(raw, {
    queryText: input.text,
    maxResults: input.maxAmount,
    pluginManager,
    signal: ctx?.signal,
    rerankMode: input.rerankMode,
    rerankProvider: input.rerankProvider,
    rerankTimeoutMs: input.rerankTimeoutMs,
  });
  const candidates = ranked.flatMap((candidate): LookedUpTermWithPrecision[] =>
    candidate.surface === "term"
      ? [
          {
            term: candidate.term,
            translation: candidate.translation,
            definition: candidate.definition,
            conceptId: candidate.conceptId,
            glossaryId: candidate.glossaryId,
            confidence: candidate.confidence,
            evidences: candidate.evidences,
            matchedText: candidate.matchedText,
            rankingDecisions: candidate.rankingDecisions,
          },
        ]
      : [],
  );

  const lanes: Record<CandidateChannel, ReadonlySet<string>> = {
    EXACT: new Set(["exact"]),
    FUZZY: new Set(["lexical"]),
    KEYWORD: new Set(["keyword"]),
    VARIANT: new Set(["morphological", "template", "fragment"]),
    SEMANTIC: new Set(["semantic"]),
  };
  const outcome = (
    channel: CandidateChannel,
  ): CandidateChannelOutcome<LookedUpTermWithPrecision> => {
    if (!requested.has(channel)) {
      return { status: "SKIPPED", reason: "NOT_REQUESTED" };
    }
    const skip = skips.get(channel);
    if (skip) return { status: "SKIPPED", reason: skip };
    const blocker = blockers.get(channel);
    if (blocker) return { status: "BLOCKED", blocker };
    const matched = candidates.filter((candidate) =>
      candidate.evidences.some((evidence) =>
        lanes[channel].has(evidence.channel),
      ),
    );
    if (matched.length > 0) {
      return createSucceededCandidateChannelOutcome(matched);
    }
    return { status: "EMPTY" };
  };
  const result = TermRecallResultSchema.parse({
    requestedChannels: input.channels,
    outcomes: {
      EXACT: outcome("EXACT"),
      FUZZY: outcome("FUZZY"),
      KEYWORD: outcome("KEYWORD"),
      VARIANT: outcome("VARIANT"),
      SEMANTIC: outcome("SEMANTIC"),
    },
  });
  assertRecallOperationAvailable(result);
  return result;
};

export const getTermRecallCandidates = (
  result: TermRecallResult,
): TermRecallCandidate[] =>
  getCandidateRecallCandidates(
    result,
    (candidate) =>
      `${candidate.conceptId}\0${candidate.term}\0${candidate.translation}`,
  );
