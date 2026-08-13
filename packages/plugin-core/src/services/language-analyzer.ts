import type {
  LanguageAnalysisBatchResult,
  LanguageAnalysisResult,
  LanguageAnalyzerConfigurationAssessment,
  NormalizedLanguageId,
} from "@cat/shared";

import type { IPluginService } from "#/services/service.ts";

export type {
  LanguageAnalysisAttestation,
  LanguageAnalysisBatchResult,
  LanguageAnalyzerConfigurationAssessment,
  LanguageAnalysisResult,
  LanguageAnalysisSentence,
  LanguageAnalysisToken,
  LanguageAnalysisVersion,
  NormalizedLanguageId,
} from "@cat/shared";

export {
  LanguageAnalysisVersionSchema,
  LanguageAnalyzerConfigurationAssessmentSchema,
  NormalizedLanguageIdSchema,
  normalizeLanguageId,
} from "@cat/shared";

export type LanguageAnalysisContext = {
  text: string;
  languageId: NormalizedLanguageId;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type LanguageAnalysisBatchContext = {
  items: Array<{ id: string; text: string }>;
  languageId: NormalizedLanguageId;
  signal?: AbortSignal;
  timeoutMs?: number;
};

/** A plugin service that produces full Language Analysis from actual runtime assets. */
export abstract class LanguageAnalyzer implements IPluginService {
  abstract getId(): string;

  getType = (): "LANGUAGE_ANALYZER" => "LANGUAGE_ANALYZER";

  abstract getLanguageAnalysisConfigurationAssessment(): LanguageAnalyzerConfigurationAssessment;

  abstract analyze(
    ctx: LanguageAnalysisContext,
  ): Promise<LanguageAnalysisResult>;

  batchAnalyze = async (
    ctx: LanguageAnalysisBatchContext,
  ): Promise<LanguageAnalysisBatchResult> => {
    const results = await Promise.all(
      ctx.items.map(async (item) => ({
        id: item.id,
        result: await this.analyze({
          text: item.text,
          languageId: ctx.languageId,
          ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
          ...(ctx.timeoutMs === undefined ? {} : { timeoutMs: ctx.timeoutMs }),
        }),
      })),
    );
    const attestation = results[0]?.result.attestation;
    if (attestation === undefined) {
      throw new Error(
        "Language Analysis batch responses require a runtime attestation.",
      );
    }
    return { attestation, results };
  };
}
