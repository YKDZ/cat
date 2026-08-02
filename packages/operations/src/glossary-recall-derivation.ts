import type { DbHandle, OperationContext } from "@cat/domain";
import {
  executeCommand,
  executeQuery,
  getTermConceptCanonicalSnapshots,
  listTermRecallDerivationLanguages,
  markRecallDerivationDependencyUnverified,
  reconcileRecallDerivationDependency,
  type RecallDerivationClaim,
} from "@cat/domain";
import { PluginManager, type Tokenizer } from "@cat/plugin-core";
import {
  compareRecallDerivationTokenizerPipelineEntries,
  computeRecallDerivationVersion,
  serviceImplementationReferenceKey,
  type LanguageAnalysisToken,
  type LanguageAnalysisVersion,
  type RecallDerivationTokenizerPipelineEntry,
  type TermRecallVariantDraft,
} from "@cat/shared";

import {
  buildTokenWindows,
  joinLemmas,
} from "./language-analysis-normalization.ts";
import { executeRequiredLanguageAnalysisBatch } from "./language-analysis-requirement.ts";

const DERIVATION_CONTRACT = "cat.glossary-recall-derivation/v1";
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
    return {
      descriptor: {
        reference,
        packageName: snapshot.package.name,
        packageVersion: snapshot.package.version,
        priority: registeredService.service.getPriority(),
        tieBreak: serviceImplementationReferenceKey(reference),
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

const computeGlossaryRecallDerivationVersion = async (
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
      variants: ["SURFACE", "CASE_FOLDED", "LEMMA"],
      stopWords: "language-analysis-isStop",
    },
  });

export const reconcileGlossaryRecallDependency = async (input: {
  db: DbHandle;
  pluginManager: PluginManager;
  languageId: string;
  languageAnalysisVersion: LanguageAnalysisVersion;
}) => {
  const pipeline = await captureTokenizerPipeline(input.pluginManager);
  const requiredDerivationVersion =
    await computeGlossaryRecallDerivationVersion(
      input.languageAnalysisVersion,
      pipeline,
    );
  const reconciliation = await executeCommand(
    { db: input.db },
    reconcileRecallDerivationDependency,
    {
      targetKind: "TERM_CONCEPT",
      languageId: input.languageId,
      requiredDerivationVersion,
    },
  );
  return { requiredDerivationVersion, reconciliation };
};

export const probeGlossaryRecallDependency = async (input: {
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
                text: input.text ?? "Glossary recall dependency probe.",
              },
            ],
            timeoutMs: input.timeoutMs ?? 5_000,
          },
          {
            ...input.ctx,
            traceId:
              input.ctx?.traceId ??
              `glossary-recall-dependency-probe:${input.languageId}`,
            pluginManager: input.pluginManager,
          },
        );
    const languageAnalysisVersion =
      input.languageAnalysisVersion ?? analysis?.languageAnalysisVersion;
    if (!languageAnalysisVersion) {
      throw new TypeError("Language Analysis dependency probe has no version.");
    }
    const dependency = await reconcileGlossaryRecallDependency({
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
        { targetKind: "TERM_CONCEPT", languageId: input.languageId },
      );
    } catch {
      // Preserve the dependency failure that invalidated prior derivations.
    }
    throw error;
  }
};

export const probeCurrentGlossaryRecallDependencies = async (input: {
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
      listTermRecallDerivationLanguages,
      {},
    ));
  const failures: unknown[] = [];
  for (const languageId of new Set(languageIds)) {
    input.signal?.throwIfAborted();
    try {
      await probeGlossaryRecallDependency({
        db: input.db,
        pluginManager: input.pluginManager,
        languageId,
        timeoutMs: input.timeoutMs ?? 5_000,
        ctx: {
          traceId: `glossary-recall-dependency-probe:${languageId}`,
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
      "One or more Glossary recall runtime dependency probes failed.",
    );
  }
};

const buildTermVariants = (input: {
  termId: number;
  text: string;
  languageId: string;
  analysisTokens: LanguageAnalysisToken[];
}): TermRecallVariantDraft[] => {
  const trimmed = input.text.trim();
  if (trimmed.length === 0) return [];
  const variants: TermRecallVariantDraft[] = [
    {
      text: trimmed,
      normalizedText: trimmed,
      variantType: "SURFACE",
      meta: { sourceTermId: input.termId },
    },
  ];
  const caseFolded = trimmed.toLocaleLowerCase(input.languageId);
  if (caseFolded !== trimmed) {
    variants.push({
      text: trimmed,
      normalizedText: caseFolded,
      variantType: "CASE_FOLDED",
      meta: { sourceTermId: input.termId },
    });
  }
  const contentTokens = input.analysisTokens.filter(
    (token) => !token.isStop && !token.isPunct,
  );
  if (contentTokens.length > 0) {
    const lemma = joinLemmas(contentTokens, input.languageId);
    if (lemma !== caseFolded && lemma !== trimmed) {
      variants.push({
        text: trimmed,
        normalizedText: lemma,
        variantType: "LEMMA",
        meta: { sourceTermId: input.termId },
      });
    }
    for (const window of buildTokenWindows(
      contentTokens,
      input.languageId,
      MAX_WINDOW_SIZE,
    )) {
      if (window.tokenCount < 2) continue;
      variants.push({
        text: window.surface,
        normalizedText: window.normalized,
        variantType: "LEMMA",
        meta: { sourceTermId: input.termId, windowSize: window.tokenCount },
      });
    }
  }
  return variants;
};

export const deriveGlossaryRecall = async (
  db: DbHandle,
  pluginManager: PluginManager,
  claim: RecallDerivationClaim,
  signal?: AbortSignal,
) => {
  const [snapshot] = await executeQuery(
    { db },
    getTermConceptCanonicalSnapshots,
    { conceptIds: [Number(claim.targetId)] },
  );
  if (!snapshot) {
    const pipeline = await captureTokenizerPipeline(pluginManager);
    const analysis = await executeRequiredLanguageAnalysisBatch(
      {
        languageId: claim.languageId,
        items: [
          {
            id: "deleted-concept-generation",
            text: "Glossary recall deleted concept generation.",
          },
        ],
      },
      {
        traceId: `recall-derivation:${claim.id}:${claim.executionEpoch}`,
        pluginManager,
        ...(signal ? { signal } : {}),
      },
    );
    return {
      conceptId: null,
      variants: [] as TermRecallVariantDraft[],
      recallDerivationVersion: await computeGlossaryRecallDerivationVersion(
        analysis.languageAnalysisVersion,
        pipeline,
      ),
    };
  }

  const terms = snapshot.terms.filter(
    (entry) => entry.languageId === claim.languageId,
  );
  if (terms.length === 0) {
    const pipeline = await captureTokenizerPipeline(pluginManager);
    const analysis = await executeRequiredLanguageAnalysisBatch(
      {
        languageId: claim.languageId,
        items: [
          {
            id: "empty-language-generation",
            text: "Glossary recall empty language generation.",
          },
        ],
      },
      {
        traceId: `recall-derivation:${claim.id}:${claim.executionEpoch}`,
        pluginManager,
        ...(signal ? { signal } : {}),
      },
    );
    return {
      conceptId: snapshot.id,
      variants: [] as TermRecallVariantDraft[],
      recallDerivationVersion: await computeGlossaryRecallDerivationVersion(
        analysis.languageAnalysisVersion,
        pipeline,
      ),
    };
  }
  const pipeline = await captureTokenizerPipeline(pluginManager);
  const analysis = await executeRequiredLanguageAnalysisBatch(
    {
      languageId: claim.languageId,
      items: terms.map((entry) => ({ id: String(entry.id), text: entry.text })),
    },
    {
      traceId: `recall-derivation:${claim.id}:${claim.executionEpoch}`,
      pluginManager,
      ...(signal ? { signal } : {}),
    },
  );
  const tokensByTermId = new Map(
    analysis.results.map((entry) => [entry.id, entry.result.tokens]),
  );
  const seen = new Set<string>();
  const variants = terms
    .flatMap((entry) =>
      buildTermVariants({
        termId: entry.id,
        text: entry.text,
        languageId: entry.languageId,
        analysisTokens: tokensByTermId.get(String(entry.id)) ?? [],
      }),
    )
    .filter((variant) => {
      const key = `${variant.variantType}\0${variant.normalizedText}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const recallDerivationVersion = await computeGlossaryRecallDerivationVersion(
    analysis.languageAnalysisVersion,
    pipeline,
  );
  return { conceptId: snapshot.id, variants, recallDerivationVersion };
};
