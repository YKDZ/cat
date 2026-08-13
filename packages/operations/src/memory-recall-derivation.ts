import type { DbHandle, OperationContext } from "@cat/domain";
import {
  executeCommand,
  executeQuery,
  getMemoryCanonicalSnapshots,
  listMemoryRecallDerivationLanguages,
  markRecallDerivationDependencyUnverified,
  publishMemoryRecallDerivation,
  reconcileRecallDerivationDependency,
} from "@cat/domain";
import { PluginManager, tokenize, type Tokenizer } from "@cat/plugin-core";
import {
  compareRecallDerivationTokenizerPipelineEntries,
  computeCanonicalInputVersion,
  computeRecallDerivationVersion,
  NormalizedLanguageIdSchema,
  RecallDerivationVersionSchema,
  serviceImplementationReferenceKey,
  type LanguageAnalysisToken,
  type LanguageAnalysisVersion,
  type MemoryCanonicalSnapshot,
  type MemoryRecallVariantDraft,
  type NormalizedLanguageId,
  type RecallDerivationTokenizerPipelineEntry,
} from "@cat/shared";
import * as z from "zod";

import {
  buildTokenWindows,
  joinLemmas,
} from "./language-analysis-normalization.ts";
import { executeRequiredLanguageAnalysisBatch } from "./language-analysis-requirement.ts";
import { LanguageAnalysisRequirementError } from "./language-analysis-requirement.ts";
import { placeholderize, slotsToMapping } from "./memory-template.ts";
import {
  RecallDerivationAdapterError,
  type RecallDerivationAdapter,
  type RecallDerivationProbeResult,
  type LeasedRecallDerivationClaim,
} from "./recall-derivation-adapter.ts";

const DERIVATION_CONTRACT = "cat.memory-recall-derivation/v1";
const MAX_WINDOW_SIZE = 6;

const isAbortError = (error: unknown, signal?: AbortSignal) =>
  signal?.aborted === true ||
  (error instanceof DOMException && error.name === "AbortError");

const memoryAdapterError = (error: unknown, committed = false) => {
  if (error instanceof RecallDerivationAdapterError) return error;
  return new RecallDerivationAdapterError(
    error instanceof LanguageAnalysisRequirementError
      ? {
          reason: "LANGUAGE_ANALYSIS",
          retryable: error.assessment.blocker?.retryable ?? false,
          message: error.message,
        }
      : error instanceof z.ZodError
        ? { reason: "TOKENIZER", retryable: false, message: error.message }
        : {
            reason: "DERIVATION_EXECUTION",
            retryable: !(error instanceof TypeError),
            message: error instanceof Error ? error.message : String(error),
          },
    error,
    committed,
  );
};

type CapturedTokenizer = {
  descriptor: RecallDerivationTokenizerPipelineEntry;
  rule: Tokenizer;
  dbId: number;
};

const captureTokenizerPipeline = async (
  pluginManager: PluginManager,
): Promise<CapturedTokenizer[]> => {
  const captured = (
    await pluginManager.captureServiceRuntimeSnapshots("TOKENIZER")
  ).map((snapshot) => {
    const { reference, registeredService, configuration } = snapshot;
    const tieBreak = serviceImplementationReferenceKey(reference);
    return {
      descriptor: {
        reference,
        packageName: snapshot.package.name,
        packageVersion: snapshot.package.version,
        priority: registeredService.service.getPriority(),
        tieBreak,
        semanticConfig: configuration.semanticConfig,
        configurationDigest: configuration.configurationDigest,
      },
      rule: registeredService.service,
      dbId: registeredService.dbId,
    };
  });
  return captured.sort((left, right) =>
    compareRecallDerivationTokenizerPipelineEntries(
      left.descriptor,
      right.descriptor,
    ),
  );
};

const computeMemoryRecallDerivationVersion = async (
  languageAnalysisVersion: LanguageAnalysisVersion,
  pipeline: CapturedTokenizer[],
) =>
  await computeRecallDerivationVersion({
    contract: DERIVATION_CONTRACT,
    languageAnalysisVersion,
    tokenizerPipeline: pipeline.map((entry) => entry.descriptor),
    normalization: {
      caseFolding: "Intl.toLocaleLowerCase",
      lemmaJoin: "cat.language-analysis-normalization/v2",
    },
    rules: {
      maxWindowSize: MAX_WINDOW_SIZE,
      templateOrientation: "query-side/v1",
      keywordTokens: "content-token-lemma/v1",
      stopWords: "language-analysis-isStop",
    },
  });

export const reconcileMemoryRecallDependency = async (input: {
  db: DbHandle;
  pluginManager: PluginManager;
  languageId: NormalizedLanguageId;
  languageAnalysisVersion: LanguageAnalysisVersion;
}) => {
  const pipeline = await captureTokenizerPipeline(input.pluginManager);
  const requiredDerivationVersion = await computeMemoryRecallDerivationVersion(
    input.languageAnalysisVersion,
    pipeline,
  );
  const reconciliation = await executeCommand(
    { db: input.db },
    reconcileRecallDerivationDependency,
    {
      targetKind: "MEMORY_ITEM",
      languageId: input.languageId,
      requiredDerivationVersion,
    },
  );
  return { requiredDerivationVersion, reconciliation };
};

export const probeMemoryRecallDependency = async (input: {
  db: DbHandle;
  pluginManager: PluginManager;
  languageId: NormalizedLanguageId;
  text?: string | undefined;
  timeoutMs?: number | undefined;
  ctx?: OperationContext | undefined;
}) => {
  try {
    const analysis = await executeRequiredLanguageAnalysisBatch(
      {
        languageId: input.languageId,
        items: [
          {
            id: "dependency-probe",
            text: input.text ?? "Recall derivation runtime dependency probe.",
          },
        ],
        timeoutMs: input.timeoutMs ?? 5_000,
      },
      {
        ...input.ctx,
        db: input.db,
        traceId:
          input.ctx?.traceId ??
          `memory-recall-dependency-probe:${input.languageId}`,
        pluginManager: input.pluginManager,
      },
    );
    const dependency = await reconcileMemoryRecallDependency({
      db: input.db,
      pluginManager: input.pluginManager,
      languageId: input.languageId,
      languageAnalysisVersion: analysis.languageAnalysisVersion,
    });
    return {
      ...dependency,
      languageAnalysisVersion: analysis.languageAnalysisVersion,
      tokens: analysis?.results[0]?.result.tokens,
    };
  } catch (error) {
    if (isAbortError(error, input.ctx?.signal)) throw error;
    let committed = false;
    try {
      await executeCommand(
        { db: input.db },
        markRecallDerivationDependencyUnverified,
        { targetKind: "MEMORY_ITEM", languageId: input.languageId },
      );
      committed = true;
    } catch {
      // Preserve the dependency failure that made prior derivations unsafe.
    }
    throw memoryAdapterError(error, committed);
  }
};

export const probeCurrentMemoryRecallDependencies = async (input: {
  db: DbHandle;
  pluginManager: PluginManager;
  languageIds?: readonly NormalizedLanguageId[] | undefined;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
}): Promise<RecallDerivationProbeResult> => {
  let committed = false;
  try {
    const languageIds =
      input.languageIds ??
      (await executeQuery(
        { db: input.db },
        listMemoryRecallDerivationLanguages,
        {},
      ));
    const failures: RecallDerivationAdapterError[] = [];
    for (const languageId of new Set(languageIds)) {
      input.signal?.throwIfAborted();
      try {
        await probeMemoryRecallDependency({
          db: input.db,
          pluginManager: input.pluginManager,
          languageId,
          timeoutMs: input.timeoutMs ?? 5_000,
          ctx: {
            traceId: `memory-recall-dependency-probe:${languageId}`,
            pluginManager: input.pluginManager,
            ...(input.signal ? { signal: input.signal } : {}),
          },
        });
        committed = true;
      } catch (error) {
        if (isAbortError(error, input.signal)) throw error;
        const failure = memoryAdapterError(error);
        committed ||= failure.committed;
        failures.push(failure);
      }
    }
    if (failures.length > 0) {
      throw new RecallDerivationAdapterError(
        failures.flatMap((failure) => failure.blockers),
        new AggregateError(
          failures,
          "One or more Memory recall runtime dependency probes failed.",
        ),
        committed,
      );
    }
    return { committed };
  } catch (error) {
    if (isAbortError(error, input.signal)) throw error;
    throw memoryAdapterError(error, committed);
  }
};

const deduplicateVariants = (
  variants: MemoryRecallVariantDraft[],
): MemoryRecallVariantDraft[] => {
  const seen = new Set<string>();
  return variants.filter((variant) => {
    const key = `${variant.querySide}\0${variant.variantType}\0${variant.normalizedText}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const buildSideVariants = (input: {
  querySide: "SOURCE" | "TRANSLATION";
  text: string;
  languageId: NormalizedLanguageId;
  analysisTokens: LanguageAnalysisToken[];
  templateArtifact: {
    sourceTemplate: string;
    translationTemplate: string;
    slotMapping: ReturnType<typeof slotsToMapping>;
  } | null;
}): MemoryRecallVariantDraft[] => {
  const trimmed = input.text.trim();
  if (trimmed.length === 0) return [];
  const variants: MemoryRecallVariantDraft[] = [
    {
      querySide: input.querySide,
      text: trimmed,
      normalizedText: trimmed,
      variantType: "SURFACE",
      meta: null,
    },
  ];
  const caseFolded = trimmed.toLocaleLowerCase(input.languageId);
  if (caseFolded !== trimmed) {
    variants.push({
      querySide: input.querySide,
      text: trimmed,
      normalizedText: caseFolded,
      variantType: "CASE_FOLDED",
      meta: null,
    });
  }
  const contentTokens = input.analysisTokens.filter(
    (token) => !token.isStop && !token.isPunct,
  );
  if (contentTokens.length > 0) {
    for (const token of contentTokens) {
      variants.push({
        querySide: input.querySide,
        text: token.text,
        normalizedText: joinLemmas([token], input.languageId),
        variantType: "LEMMA",
        meta: null,
      });
    }
    const lemma = joinLemmas(contentTokens, input.languageId);
    if (lemma !== trimmed && lemma !== caseFolded) {
      variants.push({
        querySide: input.querySide,
        text: trimmed,
        normalizedText: lemma,
        variantType: "LEMMA",
        meta: null,
      });
    }
    const fragment = contentTokens
      .map((token) => token.text)
      .join(" ")
      .toLocaleLowerCase(input.languageId);
    if (fragment !== caseFolded && fragment !== lemma) {
      variants.push({
        querySide: input.querySide,
        text: trimmed,
        normalizedText: fragment,
        variantType: "FRAGMENT",
        meta: null,
      });
    }
    for (const window of buildTokenWindows(
      contentTokens,
      input.languageId,
      MAX_WINDOW_SIZE,
    )) {
      if (window.tokenCount < 2) continue;
      variants.push({
        querySide: input.querySide,
        text: window.surface,
        normalizedText: window.normalized,
        variantType: "LEMMA",
        meta: { windowSize: window.tokenCount },
      });
    }
  }
  if (input.templateArtifact) {
    variants.push({
      querySide: input.querySide,
      text: trimmed,
      normalizedText: caseFolded,
      variantType: "TOKEN_TEMPLATE",
      meta: {
        template: input.templateArtifact.sourceTemplate,
        ...input.templateArtifact,
      },
    });
  }
  return deduplicateVariants(variants);
};

const buildTemplateArtifacts = async (
  snapshot: MemoryCanonicalSnapshot,
  pipeline: CapturedTokenizer[],
) => {
  const rules = pipeline.map((entry) => ({
    rule: entry.rule,
    id: entry.dbId,
  }));
  const [sourceTokens, translationTokens] = await Promise.all([
    tokenize(snapshot.source.value, rules),
    tokenize(snapshot.translation.value, rules),
  ]);
  const source = placeholderize(sourceTokens, snapshot.source.value);
  const translation = placeholderize(
    translationTokens,
    snapshot.translation.value,
  );
  if (source.slots.length === 0 && translation.slots.length === 0) {
    return { source: null, translation: null };
  }
  return {
    source: {
      sourceTemplate: source.template,
      translationTemplate: translation.template,
      slotMapping: [
        ...slotsToMapping(source.slots).map((slot) => ({
          ...slot,
          placeholder: `src:${slot.placeholder}`,
        })),
        ...slotsToMapping(translation.slots).map((slot) => ({
          ...slot,
          placeholder: `tgt:${slot.placeholder}`,
        })),
      ],
    },
    translation: {
      sourceTemplate: translation.template,
      translationTemplate: source.template,
      slotMapping: [
        ...slotsToMapping(translation.slots).map((slot) => ({
          ...slot,
          placeholder: `src:${slot.placeholder}`,
        })),
        ...slotsToMapping(source.slots).map((slot) => ({
          ...slot,
          placeholder: `tgt:${slot.placeholder}`,
        })),
      ],
    },
  };
};

const deriveMemoryRecall = async (
  db: DbHandle,
  pluginManager: PluginManager,
  claim: LeasedRecallDerivationClaim,
  signal?: AbortSignal,
) => {
  const [snapshot] = await executeQuery({ db }, getMemoryCanonicalSnapshots, {
    memoryItemIds: [Number(claim.targetId)],
  });
  if (!snapshot) {
    const digest = await computeCanonicalInputVersion({
      contract: "cat.memory-recall-tombstone-derivation/v1",
    });
    return {
      memoryId: null,
      variants: [] as MemoryRecallVariantDraft[],
      recallDerivationVersion:
        claim.requiredDerivationVersion ??
        RecallDerivationVersionSchema.parse(digest),
    };
  }

  const sides = [
    {
      id: "SOURCE" as const,
      value: snapshot.source.value,
      languageId: NormalizedLanguageIdSchema.parse(snapshot.source.languageId),
    },
    {
      id: "TRANSLATION" as const,
      value: snapshot.translation.value,
      languageId: NormalizedLanguageIdSchema.parse(
        snapshot.translation.languageId,
      ),
    },
  ].filter((side) => side.languageId === claim.languageId);
  if (sides.length === 0) {
    throw new TypeError(
      `Memory Item ${snapshot.id} has no ${claim.languageId} query side.`,
    );
  }
  const pipeline = await captureTokenizerPipeline(pluginManager);
  const analysis = await executeRequiredLanguageAnalysisBatch(
    {
      languageId: claim.languageId,
      items: sides.map((side) => ({ id: side.id, text: side.value })),
    },
    {
      db,
      traceId: `recall-derivation:${claim.id}:${claim.executionEpoch}`,
      pluginManager,
      ...(signal ? { signal } : {}),
    },
  );
  const analyses = new Map(
    analysis.results.map((entry) => [entry.id, entry.result.tokens]),
  );
  const templates = await buildTemplateArtifacts(snapshot, pipeline);
  const variants = sides.flatMap((side) =>
    buildSideVariants({
      querySide: side.id,
      text: side.value,
      languageId: side.languageId,
      analysisTokens: analyses.get(side.id) ?? [],
      templateArtifact:
        side.id === "SOURCE" ? templates.source : templates.translation,
    }),
  );
  const recallDerivationVersion = await computeMemoryRecallDerivationVersion(
    analysis.languageAnalysisVersion,
    pipeline,
  );
  return { memoryId: snapshot.memoryId, variants, recallDerivationVersion };
};

export const memoryRecallDerivationAdapter = {
  targetKind: "MEMORY_ITEM",
  deriveAndPublish: async (input) => {
    try {
      const derived = await deriveMemoryRecall(
        input.db,
        input.pluginManager,
        input.claim,
        input.signal,
      );
      const reconciled =
        input.claim.requiredDerivationVersion !== null &&
        input.claim.requiredDerivationVersion !==
          derived.recallDerivationVersion;
      if (reconciled) {
        await executeCommand(
          { db: input.db },
          reconcileRecallDerivationDependency,
          {
            targetKind: "MEMORY_ITEM",
            languageId: input.claim.languageId,
            requiredDerivationVersion: derived.recallDerivationVersion,
          },
        );
      }
      const published = await executeCommand(
        { db: input.db },
        publishMemoryRecallDerivation,
        {
          targetId: input.claim.targetId,
          memoryId: derived.memoryId,
          languageId: input.claim.languageId,
          demandRevision: input.claim.demandRevision,
          executionEpoch: input.claim.executionEpoch,
          leaseToken: input.claim.leaseToken,
          canonicalInputVersion: input.claim.canonicalInputVersion,
          recallDerivationVersion: derived.recallDerivationVersion,
          variants: derived.variants,
        },
      );
      return { ...published, reconciled };
    } catch (error) {
      throw memoryAdapterError(error);
    }
  },
  probeCurrentDependencies: probeCurrentMemoryRecallDependencies,
} satisfies RecallDerivationAdapter<"MEMORY_ITEM">;
