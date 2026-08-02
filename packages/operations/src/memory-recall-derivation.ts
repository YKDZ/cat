import type { DbHandle, OperationContext } from "@cat/domain";
import {
  claimRecallDerivationDemands,
  executeCommand,
  executeQuery,
  getMemoryCanonicalSnapshots,
  getRecallDerivationStates,
  listMemoryRecallDerivationLanguages,
  markRecallDerivationDependencyUnverified,
  publishMemoryRecallDerivation,
  publishTermRecallDerivation,
  reconcileRecallDerivationDependency,
  reconcileRecallDerivationDemands,
  recordRecallDerivationFailure,
  releaseRecallDerivationWorkerLeases,
  renewRecallDerivationLease,
  type RecallDerivationClaim,
} from "@cat/domain";
import { PluginManager, tokenize, type Tokenizer } from "@cat/plugin-core";
import { serverLogger as logger } from "@cat/server-shared";
import {
  compareRecallDerivationTokenizerPipelineEntries,
  computeCanonicalInputVersion,
  computeRecallDerivationVersion,
  RecallDerivationReferenceSchema,
  RecallDerivationVersionSchema,
  serviceImplementationReferenceKey,
  type LanguageAnalysisToken,
  type LanguageAnalysisVersion,
  type MemoryCanonicalSnapshot,
  type MemoryRecallVariantDraft,
  type RecallDerivationBlocker,
  type RecallDerivationReference,
  type RecallDerivationTokenizerPipelineEntry,
} from "@cat/shared";
import * as z from "zod";

import {
  deriveGlossaryRecall,
  probeCurrentGlossaryRecallDependencies,
} from "./glossary-recall-derivation.ts";
import {
  buildTokenWindows,
  joinLemmas,
} from "./language-analysis-normalization.ts";
import {
  executeRequiredLanguageAnalysisBatch,
  LanguageAnalysisRequirementError,
} from "./language-analysis-requirement.ts";
import { placeholderize, slotsToMapping } from "./memory-template.ts";

const DERIVATION_CONTRACT = "cat.memory-recall-derivation/v1";
const MAX_WINDOW_SIZE = 6;

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
      lemmaJoin: "cat.language-analysis-normalization/v1",
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
  languageId: string;
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
  languageId: string;
  text?: string | undefined;
  languageAnalysisVersion?: LanguageAnalysisVersion | undefined;
  timeoutMs?: number | undefined;
  ctx?: OperationContext | undefined;
}) => {
  try {
    const analysis = input.languageAnalysisVersion
      ? undefined
      : await executeRequiredLanguageAnalysisBatch(
          {
            languageId: input.languageId,
            items: [
              {
                id: "dependency-probe",
                text:
                  input.text ?? "Recall derivation runtime dependency probe.",
              },
            ],
            timeoutMs: input.timeoutMs ?? 5_000,
          },
          {
            ...input.ctx,
            traceId:
              input.ctx?.traceId ??
              `memory-recall-dependency-probe:${input.languageId}`,
            pluginManager: input.pluginManager,
          },
        );
    const languageAnalysisVersion =
      input.languageAnalysisVersion ?? analysis?.languageAnalysisVersion;
    if (!languageAnalysisVersion) {
      throw new TypeError("Language Analysis dependency probe has no version.");
    }
    const dependency = await reconcileMemoryRecallDependency({
      db: input.db,
      pluginManager: input.pluginManager,
      languageId: input.languageId,
      languageAnalysisVersion,
    });
    return {
      ...dependency,
      languageAnalysisVersion,
      tokens: analysis?.results[0]?.result.tokens,
    };
  } catch (error) {
    try {
      await executeCommand(
        { db: input.db },
        markRecallDerivationDependencyUnverified,
        { targetKind: "MEMORY_ITEM", languageId: input.languageId },
      );
    } catch {
      // Preserve the dependency failure that made prior derivations unsafe.
    }
    throw error;
  }
};

export const probeCurrentMemoryRecallDependencies = async (input: {
  db: DbHandle;
  pluginManager: PluginManager;
  languageIds?: string[] | undefined;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
}): Promise<void> => {
  const languageIds =
    input.languageIds ??
    (await executeQuery(
      { db: input.db },
      listMemoryRecallDerivationLanguages,
      {},
    ));
  const failures: unknown[] = [];
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
    } catch (error) {
      input.signal?.throwIfAborted();
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      "One or more Memory recall runtime dependency probes failed.",
    );
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
  languageId: string;
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
  claim: RecallDerivationClaim,
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
      languageId: snapshot.source.languageId,
    },
    {
      id: "TRANSLATION" as const,
      value: snapshot.translation.value,
      languageId: snapshot.translation.languageId,
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

const deriveAndPublishClaim = async (input: {
  db: DbHandle;
  pluginManager: PluginManager;
  claim: RecallDerivationClaim & { leaseToken: string };
  signal?: AbortSignal | undefined;
}) => {
  const { claim } = input;
  if (claim.targetKind === "MEMORY_ITEM") {
    const derived = await deriveMemoryRecall(
      input.db,
      input.pluginManager,
      claim,
      input.signal,
    );
    if (
      claim.requiredDerivationVersion !== null &&
      claim.requiredDerivationVersion !== derived.recallDerivationVersion
    ) {
      await executeCommand(
        { db: input.db },
        reconcileRecallDerivationDependency,
        {
          targetKind: claim.targetKind,
          languageId: claim.languageId,
          requiredDerivationVersion: derived.recallDerivationVersion,
        },
      );
    }
    return await executeCommand(
      { db: input.db },
      publishMemoryRecallDerivation,
      {
        targetId: claim.targetId,
        memoryId: derived.memoryId,
        languageId: claim.languageId,
        demandRevision: claim.demandRevision,
        executionEpoch: claim.executionEpoch,
        leaseToken: claim.leaseToken,
        canonicalInputVersion: claim.canonicalInputVersion,
        recallDerivationVersion: derived.recallDerivationVersion,
        variants: derived.variants,
      },
    );
  }

  if (claim.targetKind !== "TERM_CONCEPT") {
    const exhaustive: never = claim.targetKind;
    throw new TypeError(
      `Unsupported Recall target kind: ${String(exhaustive)}`,
    );
  }

  const derived = await deriveGlossaryRecall(
    input.db,
    input.pluginManager,
    claim,
    input.signal,
  );
  if (
    claim.requiredDerivationVersion !== null &&
    claim.requiredDerivationVersion !== derived.recallDerivationVersion
  ) {
    await executeCommand(
      { db: input.db },
      reconcileRecallDerivationDependency,
      {
        targetKind: claim.targetKind,
        languageId: claim.languageId,
        requiredDerivationVersion: derived.recallDerivationVersion,
      },
    );
  }
  return await executeCommand({ db: input.db }, publishTermRecallDerivation, {
    targetId: claim.targetId,
    conceptId: derived.conceptId,
    languageId: claim.languageId,
    demandRevision: claim.demandRevision,
    executionEpoch: claim.executionEpoch,
    leaseToken: claim.leaseToken,
    canonicalInputVersion: claim.canonicalInputVersion,
    recallDerivationVersion: derived.recallDerivationVersion,
    variants: derived.variants,
  });
};

export type ProcessRecallDerivationBatchOptions = {
  db: DbHandle;
  pluginManager: PluginManager;
  signal?: AbortSignal | undefined;
  workerId?: string | undefined;
  limit?: number | undefined;
  leaseDurationMs?: number | undefined;
  maxAttempts?: number | undefined;
};

export const processRecallDerivationBatch = async (
  options: ProcessRecallDerivationBatchOptions,
): Promise<{
  claimed: number;
  published: number;
  stale: number;
  failed: number;
}> => {
  const workerId = options.workerId ?? crypto.randomUUID();
  const leaseDurationMs = options.leaseDurationMs ?? 60_000;
  const limit = options.limit ?? 10;
  await executeCommand(
    { db: options.db },
    reconcileRecallDerivationDemands,
    {},
  );
  let claimed = 0;
  let published = 0;
  let stale = 0;
  let failed = 0;
  for (let index = 0; index < limit; index += 1) {
    if (options.signal?.aborted) break;
    const [claim] = await executeCommand(
      { db: options.db },
      claimRecallDerivationDemands,
      { workerId, limit: 1, leaseDurationMs },
    );
    if (!claim) break;
    claimed += 1;
    if (!claim.leaseToken) {
      await executeCommand(
        { db: options.db },
        reconcileRecallDerivationDemands,
        {},
      );
      failed += 1;
      continue;
    }
    const fence = {
      stateId: claim.id,
      demandRevision: claim.demandRevision,
      executionEpoch: claim.executionEpoch,
      leaseToken: claim.leaseToken,
      canonicalInputVersion: claim.canonicalInputVersion,
    };
    let renewal: Promise<void> | undefined;
    const renewLease = () => {
      if (renewal) return;
      renewal = (async () => {
        try {
          await executeCommand({ db: options.db }, renewRecallDerivationLease, {
            ...fence,
            leaseDurationMs,
          });
        } catch {
          // Publication and failure recording remain fenced if renewal failed.
        } finally {
          renewal = undefined;
        }
      })();
    };
    const heartbeat = setInterval(
      renewLease,
      Math.max(1_000, Math.floor(leaseDurationMs / 3)),
    );
    heartbeat.unref();
    try {
      const result = await deriveAndPublishClaim({
        db: options.db,
        pluginManager: options.pluginManager,
        claim: { ...claim, leaseToken: claim.leaseToken },
        ...(options.signal ? { signal: options.signal } : {}),
      });
      if (result.status === "PUBLISHED") published += 1;
      else stale += 1;
    } catch (error) {
      if (options.signal?.aborted) continue;
      const blocker: RecallDerivationBlocker =
        error instanceof LanguageAnalysisRequirementError
          ? {
              reason: "LANGUAGE_ANALYSIS",
              retryable: error.assessment.blocker?.retryable ?? false,
              message: error.message,
            }
          : {
              reason:
                error instanceof TypeError
                  ? "DERIVATION_EXECUTION"
                  : "TOKENIZER",
              retryable: !(
                error instanceof TypeError || error instanceof z.ZodError
              ),
              message: error instanceof Error ? error.message : String(error),
            };
      const result = await executeCommand(
        { db: options.db },
        recordRecallDerivationFailure,
        {
          ...fence,
          blocker,
          maxAttempts: options.maxAttempts ?? 5,
          initialBackoffMs: 1_000,
          maxBackoffMs: 60_000,
        },
      );
      if (result.status === "STALE") stale += 1;
      else failed += 1;
    } finally {
      clearInterval(heartbeat);
      await renewal;
    }
  }
  return { claimed, published, stale, failed };
};

export class RecallDerivationFreshnessError extends Error {
  public readonly status: "BLOCKED" | "FAILED" | "TIMEOUT";
  public readonly references: RecallDerivationReference[];

  public constructor(
    status: "BLOCKED" | "FAILED" | "TIMEOUT",
    references: RecallDerivationReference[],
  ) {
    super(`Recall Derivation freshness wait ended with ${status}.`);
    this.name = "RecallDerivationFreshnessError";
    this.status = status;
    this.references = references;
  }
}

export type RecallDerivationFreshnessAssessment =
  | { status: "FRESH" }
  | { status: "PENDING" }
  | { status: "MISSING"; references: RecallDerivationReference[] }
  | {
      status: "BLOCKED" | "FAILED";
      references: RecallDerivationReference[];
      blockers: RecallDerivationBlocker[];
    };

const referenceKey = (reference: {
  targetKind: string;
  targetId: string;
  languageId: string;
}) => `${reference.targetKind}\0${reference.targetId}\0${reference.languageId}`;

const assessPersistedRecallDerivationFreshness = async (
  references: RecallDerivationReference[],
  db: DbHandle,
): Promise<RecallDerivationFreshnessAssessment> => {
  if (references.length === 0) return { status: "FRESH" };
  const states = await executeQuery({ db }, getRecallDerivationStates, {
    references,
  });
  const byKey = new Map(states.map((state) => [referenceKey(state), state]));
  const missing = references.filter(
    (reference) => !byKey.has(referenceKey(reference)),
  );
  if (missing.length > 0) return { status: "MISSING", references: missing };
  const current = references.map(
    (reference) => byKey.get(referenceKey(reference))!,
  );
  const terminal = current.filter(
    (state) => state.status === "BLOCKED" || state.status === "FAILED",
  );
  if (terminal.length > 0) {
    const status = terminal.some((state) => state.status === "FAILED")
      ? "FAILED"
      : "BLOCKED";
    return {
      status,
      references: terminal.map((state) =>
        RecallDerivationReferenceSchema.parse({
          targetKind: state.targetKind,
          targetId: state.targetId,
          languageId: state.languageId,
          demandRevision: state.demandRevision,
        }),
      ),
      blockers: terminal.flatMap((state) =>
        state.blocker ? [state.blocker] : [],
      ),
    };
  }
  const fresh = current.every(
    (state, index) =>
      state.status === "FRESH" &&
      state.demandRevision >= references[index]!.demandRevision &&
      state.currentCanonicalInputVersion === state.canonicalInputVersion &&
      state.currentDerivationVersion === state.requiredDerivationVersion,
  );
  return { status: fresh ? "FRESH" : "PENDING" };
};

const abortableDelay = async (
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> => {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason);
    };
    const timer = setTimeout(finish, delayMs);
    timer.unref();
    signal?.addEventListener("abort", onAbort, { once: true });
  });
};

const flattenProbeErrors = (error: unknown): unknown[] =>
  error instanceof AggregateError
    ? error.errors.flatMap((entry) => flattenProbeErrors(entry))
    : [error];

const freshnessProbeStatus = (error: unknown): "BLOCKED" | "FAILED" => {
  const errors = flattenProbeErrors(error);
  return errors.every(
    (entry) => entry instanceof LanguageAnalysisRequirementError,
  )
    ? "BLOCKED"
    : "FAILED";
};

const freshnessProbeBlockers = (error: unknown): RecallDerivationBlocker[] => {
  const errors = flattenProbeErrors(error);
  return errors.map((entry) =>
    entry instanceof LanguageAnalysisRequirementError
      ? {
          reason: "LANGUAGE_ANALYSIS",
          retryable: entry.assessment.blocker?.retryable ?? false,
          message: entry.message,
        }
      : {
          reason: "TOKENIZER",
          retryable: true,
          message: entry instanceof Error ? entry.message : String(entry),
        },
  );
};

export const assessRecallDerivationFreshness = async (
  references: RecallDerivationReference[],
  options: {
    db: DbHandle;
    pluginManager: PluginManager;
    signal?: AbortSignal | undefined;
    dependencyProbeTimeoutMs?: number | undefined;
  },
): Promise<RecallDerivationFreshnessAssessment> => {
  if (references.length === 0) return { status: "FRESH" };
  const memoryReferences = references.filter(
    (reference) => reference.targetKind === "MEMORY_ITEM",
  );
  const glossaryReferences = references.filter(
    (reference) => reference.targetKind === "TERM_CONCEPT",
  );
  const probes = [
    ...[...new Set(memoryReferences.map((entry) => entry.languageId))].map(
      (languageId) => ({
        references: memoryReferences.filter(
          (reference) => reference.languageId === languageId,
        ),
        run: async () =>
          await probeCurrentMemoryRecallDependencies({
            db: options.db,
            pluginManager: options.pluginManager,
            languageIds: [languageId],
            timeoutMs: options.dependencyProbeTimeoutMs ?? 5_000,
            signal: options.signal,
          }),
      }),
    ),
    ...[...new Set(glossaryReferences.map((entry) => entry.languageId))].map(
      (languageId) => ({
        references: glossaryReferences.filter(
          (reference) => reference.languageId === languageId,
        ),
        run: async () =>
          await probeCurrentGlossaryRecallDependencies({
            db: options.db,
            pluginManager: options.pluginManager,
            languageIds: [languageId],
            timeoutMs: options.dependencyProbeTimeoutMs ?? 5_000,
            signal: options.signal,
          }),
      }),
    ),
  ];
  const failures: Array<{
    error: unknown;
    references: RecallDerivationReference[];
  }> = [];
  for (const probe of probes) {
    try {
      await probe.run();
    } catch (error) {
      options.signal?.throwIfAborted();
      failures.push({ error, references: probe.references });
    }
  }
  if (failures.length > 0) {
    const errors = failures.map((failure) => failure.error);
    return {
      status: freshnessProbeStatus(new AggregateError(errors)),
      references: failures.flatMap((failure) => failure.references),
      blockers: freshnessProbeBlockers(new AggregateError(errors)),
    };
  }
  return await assessPersistedRecallDerivationFreshness(references, options.db);
};

export const waitForRecallDerivationFresh = async (
  references: RecallDerivationReference[],
  options: ProcessRecallDerivationBatchOptions & {
    timeoutMs?: number | undefined;
    pollIntervalMs?: number | undefined;
    dependencyProbeIntervalMs?: number | undefined;
    dependencyProbeTimeoutMs?: number | undefined;
  },
): Promise<void> => {
  if (references.length === 0) return;
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pollIntervalMs = options.pollIntervalMs ?? 100;
  const dependencyProbeIntervalMs = options.dependencyProbeIntervalMs ?? 1_000;
  let nextDependencyProbeAt = startedAt;
  while (true) {
    options.signal?.throwIfAborted();
    let assessment = await assessPersistedRecallDerivationFreshness(
      references,
      options.db,
    );
    if (Date.now() - startedAt >= timeoutMs) {
      throw new RecallDerivationFreshnessError("TIMEOUT", references);
    }
    const now = Date.now();
    if (assessment.status === "FRESH" || now >= nextDependencyProbeAt) {
      assessment = await assessRecallDerivationFreshness(references, options);
      nextDependencyProbeAt = Date.now() + dependencyProbeIntervalMs;
      if (assessment.status === "FRESH") return;
      if (assessment.status === "BLOCKED" || assessment.status === "FAILED") {
        throw new RecallDerivationFreshnessError(
          assessment.status,
          assessment.references,
        );
      }
    } else if (
      assessment.status === "BLOCKED" ||
      assessment.status === "FAILED"
    ) {
      throw new RecallDerivationFreshnessError(
        assessment.status,
        assessment.references,
      );
    }
    await processRecallDerivationBatch(options);
    await abortableDelay(pollIntervalMs, options.signal);
  }
};

export type RecallDerivationWorker = { stop: () => Promise<void> };

export const startRecallDerivationWorker = async (
  options: Omit<ProcessRecallDerivationBatchOptions, "signal"> & {
    pollIntervalMs?: number | undefined;
    dependencyProbeIntervalMs?: number | undefined;
    dependencyProbeTimeoutMs?: number | undefined;
    initialErrorBackoffMs?: number | undefined;
    maxErrorBackoffMs?: number | undefined;
  },
): Promise<RecallDerivationWorker> => {
  const controller = new AbortController();
  let stopped = false;
  const workerId = options.workerId ?? crypto.randomUUID();
  await executeCommand(
    { db: options.db },
    reconcileRecallDerivationDemands,
    {},
  );
  const dependencyProbeIntervalMs = options.dependencyProbeIntervalMs ?? 30_000;
  let nextDependencyProbeAt = 0;
  let consecutiveFailures = 0;
  const run = (async () => {
    try {
      while (!controller.signal.aborted) {
        try {
          if (Date.now() >= nextDependencyProbeAt) {
            nextDependencyProbeAt = Date.now() + dependencyProbeIntervalMs;
            const dependencyProbes = [
              async () =>
                await probeCurrentMemoryRecallDependencies({
                  db: options.db,
                  pluginManager: options.pluginManager,
                  timeoutMs: options.dependencyProbeTimeoutMs ?? 5_000,
                  signal: controller.signal,
                }),
              async () =>
                await probeCurrentGlossaryRecallDependencies({
                  db: options.db,
                  pluginManager: options.pluginManager,
                  timeoutMs: options.dependencyProbeTimeoutMs ?? 5_000,
                  signal: controller.signal,
                }),
            ];
            for (const probe of dependencyProbes) {
              try {
                await probe();
              } catch (error) {
                logger
                  .child({ component: "recall-derivation-worker", workerId })
                  .warn("Recall Derivation dependency probe failed", {
                    error,
                  });
              }
            }
          }
          await processRecallDerivationBatch({
            ...options,
            workerId,
            signal: controller.signal,
          });
          consecutiveFailures = 0;
          await abortableDelay(
            options.pollIntervalMs ?? 250,
            controller.signal,
          );
        } catch (error) {
          if (controller.signal.aborted) break;
          consecutiveFailures += 1;
          logger
            .child({ component: "recall-derivation-worker", workerId })
            .error("Recall Derivation worker iteration failed", { error });
          const initialBackoffMs = options.initialErrorBackoffMs ?? 250;
          const maxBackoffMs = options.maxErrorBackoffMs ?? 30_000;
          const backoffMs = Math.min(
            maxBackoffMs,
            initialBackoffMs * 2 ** Math.min(consecutiveFailures - 1, 10),
          );
          await abortableDelay(backoffMs, controller.signal).catch(
            (delayError: unknown) => {
              if (!controller.signal.aborted) throw delayError;
            },
          );
        }
      }
    } finally {
      await executeCommand(
        { db: options.db },
        releaseRecallDerivationWorkerLeases,
        { workerId },
      );
    }
  })();
  return {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      controller.abort();
      await run;
    },
  };
};
