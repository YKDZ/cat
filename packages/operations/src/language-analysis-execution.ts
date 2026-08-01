import type { OperationContext } from "@cat/domain";
import type { LanguageAnalyzer } from "@cat/plugin-core";
import {
  resolvePluginManager,
  resolveServiceImplementation,
} from "@cat/server-shared";
import {
  computeLanguageAnalysisVersion,
  type LanguageAnalysisAttestation,
  type LanguageAnalysisBatchResult,
  type LanguageAnalysisResult,
  type NormalizedLanguageId,
  type ServiceImplementationReference,
  validateLanguageAnalysisBatchResult,
  validateLanguageAnalysisResult,
} from "@cat/shared";

type ResolvedLanguageAnalyzer = {
  analyzer: LanguageAnalyzer;
  implementation: {
    reference: ServiceImplementationReference;
    packageName: string;
    packageVersion: string;
  };
};

export type HostValidatedLanguageAnalysisResult = LanguageAnalysisResult & {
  languageAnalysisVersion: Awaited<
    ReturnType<typeof computeLanguageAnalysisVersion>
  >;
};

export type HostValidatedLanguageAnalysisBatchResult =
  LanguageAnalysisBatchResult & {
    languageAnalysisVersion: Awaited<
      ReturnType<typeof computeLanguageAnalysisVersion>
    >;
  };

const resolveLanguageAnalyzer = async (
  reference: ServiceImplementationReference,
  ctx: OperationContext | undefined,
): Promise<ResolvedLanguageAnalyzer> => {
  const pluginManager = resolvePluginManager(ctx?.pluginManager);
  const selected = {
    reference,
    service: resolveServiceImplementation(
      pluginManager,
      reference,
      "LANGUAGE_ANALYZER",
    ),
  };

  const packageData = await pluginManager
    .getLoader()
    .getData(selected.reference.pluginId);
  return {
    analyzer: selected.service,
    implementation: {
      reference: selected.reference,
      packageName: packageData.name,
      packageVersion: packageData.version,
    },
  };
};

const withVersion = async (
  attestation: LanguageAnalysisAttestation,
): Promise<{
  languageAnalysisVersion: Awaited<
    ReturnType<typeof computeLanguageAnalysisVersion>
  >;
}> => ({
  languageAnalysisVersion: await computeLanguageAnalysisVersion(attestation),
});

/** Calls the selected analyzer and makes its runtime attestation host-verifiable. */
export const executeLanguageAnalysis = async (
  input: {
    languageAnalyzer: ServiceImplementationReference;
    text: string;
    languageId: NormalizedLanguageId;
    timeoutMs?: number | undefined;
  },
  ctx?: OperationContext,
): Promise<HostValidatedLanguageAnalysisResult> => {
  const selected = await resolveLanguageAnalyzer(input.languageAnalyzer, ctx);
  const result = validateLanguageAnalysisResult(
    await selected.analyzer.analyze({
      text: input.text,
      languageId: input.languageId,
      ...(ctx?.signal === undefined ? {} : { signal: ctx.signal }),
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    }),
    input.languageId,
    { text: input.text, implementation: selected.implementation },
  );
  return { ...result, ...(await withVersion(result.attestation)) };
};

/** Calls the selected analyzer once and validates a strict input-order batch bijection. */
export const executeLanguageAnalysisBatch = async (
  input: {
    languageAnalyzer: ServiceImplementationReference;
    items: Array<{ id: string; text: string }>;
    languageId: NormalizedLanguageId;
    timeoutMs?: number | undefined;
  },
  ctx?: OperationContext,
): Promise<HostValidatedLanguageAnalysisBatchResult> => {
  const selected = await resolveLanguageAnalyzer(input.languageAnalyzer, ctx);
  const result = validateLanguageAnalysisBatchResult(
    await selected.analyzer.batchAnalyze({
      items: input.items,
      languageId: input.languageId,
      ...(ctx?.signal === undefined ? {} : { signal: ctx.signal }),
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    }),
    input.languageId,
    { items: input.items, implementation: selected.implementation },
  );
  return { ...result, ...(await withVersion(result.attestation)) };
};
