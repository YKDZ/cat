import type {
  LanguageAnalysisAttestation,
  LanguageAnalysisBatchContext,
  LanguageAnalysisBatchResult,
  LanguageAnalysisContext,
  LanguageAnalysisResult,
  LanguageAnalysisToken,
  NormalizedLanguageId,
  PluginLogger,
  PluginServiceAvailability,
} from "@cat/plugin-core";
import {
  LanguageAnalyzer,
  PluginServiceUnavailableError,
} from "@cat/plugin-core";
import {
  normalizeLanguageId,
  LanguageAnalysisValidationError,
  ServiceImplementationReferenceSchema,
  type JSONType,
  type ServiceImplementationReference,
} from "@cat/shared";
import { Pool } from "undici";
import * as z from "zod";

import {
  serializeAnalyzeRequest,
  serializeBatchAnalyzeRequest,
  SPACY_PROTOCOL_LIMITS,
} from "./protocol-limits.ts";
import type {
  SpacyLanguageAnalysisResponse,
  SpacyRuntimeAttestation,
  SpacyTokenResponse,
} from "./types.ts";
import {
  SpacyCapabilitiesResponseSchema,
  SpacyLanguageAnalysisBatchResponseSchema,
  SpacyLanguageAnalysisResponseSchema,
} from "./types.ts";

const LanguageIdsSchema = z
  .array(z.string())
  .min(1)
  .transform((values, ctx) => {
    const languages: NormalizedLanguageId[] = [];
    for (const [index, value] of values.entries()) {
      try {
        const languageId = normalizeLanguageId(value);
        if (languages.includes(languageId)) {
          ctx.addIssue({
            code: "custom",
            path: [index],
            message: `Language ID collides after canonicalization: ${languageId}.`,
          });
        } else languages.push(languageId);
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          path: [index],
          message:
            error instanceof Error
              ? error.message
              : "Invalid BCP 47 language ID.",
        });
      }
    }
    return languages.sort((left, right) => left.localeCompare(right));
  });

const SpacyConfigSchema = z.strictObject({
  serverUrl: z.url().default("http://localhost:8000"),
  timeout: z
    .int()
    .positive()
    .max(SPACY_PROTOCOL_LIMITS.maxTimeoutMs)
    .default(30000),
  languageIds: LanguageIdsSchema.prefault(["en", "zh-Hans"]),
});
type SpacyConfig = z.infer<typeof SpacyConfigSchema>;

const PLACEHOLDER_SERVER_URLS = new Set(["", "http://localhost:8000"]);
const normalizeServerUrl = (value: string | undefined): string =>
  value?.trim().toLowerCase().replace(/\/+$/, "") ?? "";
const requestSignal = (signal: AbortSignal | undefined, timeoutMs: number) =>
  signal === undefined
    ? AbortSignal.timeout(timeoutMs)
    : AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);

class SpacyServerResponseError extends Error {
  public readonly status: number;

  constructor(status: number) {
    super(`spaCy server returned HTTP ${status}.`);
    this.status = status;
  }
}

const requireSuccessfulResponse = async (response: {
  statusCode: number;
  body: { dump(): Promise<void> };
}) => {
  if (response.statusCode >= 200 && response.statusCode < 300) return;
  await response.body.dump();
  throw new SpacyServerResponseError(response.statusCode);
};

export class SpacyLanguageAnalyzer extends LanguageAnalyzer {
  private readonly pool: Pool;
  private readonly config: SpacyConfig;
  private readonly reference: ServiceImplementationReference;
  private readonly packageIdentity: { name: string; version: string };

  constructor(
    config: JSONType,
    scope: { scopeId: string; scopeType: string },
    packageIdentity: { name: string; version: string },
    _logger?: PluginLogger,
  ) {
    super();
    this.packageIdentity = packageIdentity;
    this.config = SpacyConfigSchema.parse(config);
    this.reference = ServiceImplementationReferenceSchema.parse({
      pluginId: "spacy-language-analyzer",
      serviceId: this.getId(),
      serviceType: "LANGUAGE_ANALYZER",
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
    });
    this.pool = new Pool(this.config.serverUrl);
  }

  getId = () => "spacy-language-analyzer";

  getLanguageAnalysisConfigurationAssessment = () => {
    if (this.getMissingConfigAvailability())
      return {
        status: "INVALID" as const,
        reason: "INVALID_CONFIGURATION" as const,
      };
    return {
      status: "VALID" as const,
      supportedLanguages: this.config.languageIds,
      semanticConfiguration: { languageIds: this.config.languageIds },
    };
  };

  getAvailability = async (): Promise<PluginServiceAvailability> => {
    const missing = this.getMissingConfigAvailability();
    if (missing) return missing;
    try {
      const response = await this.pool.request({
        method: "GET",
        path: "/capabilities",
        headersTimeout: this.config.timeout,
        bodyTimeout: this.config.timeout,
        signal: AbortSignal.timeout(this.config.timeout),
      });
      await requireSuccessfulResponse(response);
      const capabilities = SpacyCapabilitiesResponseSchema.parse(
        await response.body.json(),
      );
      const available = new Set(
        capabilities.languages.map(({ languageId }) =>
          normalizeLanguageId(languageId),
        ),
      );
      return this.config.languageIds.some((languageId) =>
        available.has(languageId),
      )
        ? { available: true, reason: "ok" }
        : { available: false, reason: "disabled-by-runtime" };
    } catch {
      return {
        available: false,
        reason: "remote-unreachable",
        message:
          "spaCy server is unreachable or does not provide configured languages.",
      };
    }
  };

  analyze = async (
    ctx: LanguageAnalysisContext,
  ): Promise<LanguageAnalysisResult> => {
    this.requireSupportedLanguage(ctx.languageId);
    const timeoutMs = ctx.timeoutMs ?? this.config.timeout;
    const body = serializeAnalyzeRequest({
      text: ctx.text,
      languageId: ctx.languageId,
      timeoutMs,
    });
    const signal = requestSignal(ctx.signal, timeoutMs);
    try {
      const response = await this.pool.request({
        method: "POST",
        path: "/analyze",
        headers: { "Content-Type": "application/json" },
        body,
        signal,
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
      });
      await requireSuccessfulResponse(response);
      return this.transformResponse(
        SpacyLanguageAnalysisResponseSchema.parse(await response.body.json()),
        ctx.languageId,
      );
    } catch (error) {
      return this.rethrow(error, ctx.signal, signal);
    }
  };

  override batchAnalyze = async (
    ctx: LanguageAnalysisBatchContext,
  ): Promise<LanguageAnalysisBatchResult> => {
    this.requireSupportedLanguage(ctx.languageId);
    const timeoutMs = ctx.timeoutMs ?? this.config.timeout;
    const body = serializeBatchAnalyzeRequest({
      items: ctx.items,
      languageId: ctx.languageId,
      timeoutMs,
    });
    const signal = requestSignal(ctx.signal, timeoutMs);
    try {
      const response = await this.pool.request({
        method: "POST",
        path: "/batch-analyze",
        headers: { "Content-Type": "application/json" },
        body,
        signal,
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
      });
      await requireSuccessfulResponse(response);
      const data = SpacyLanguageAnalysisBatchResponseSchema.parse(
        await response.body.json(),
      );
      return {
        attestation: this.transformAttestation(
          data.runtimeAttestation,
          ctx.languageId,
        ),
        results: data.results.map(({ id, result }) => ({
          id,
          result: this.transformResponse(result, ctx.languageId),
        })),
      };
    } catch (error) {
      return this.rethrow(error, ctx.signal, signal);
    }
  };

  private transformResponse = (
    raw: SpacyLanguageAnalysisResponse,
    languageId: NormalizedLanguageId,
  ): LanguageAnalysisResult => ({
    sentences: raw.sentences.map((sentence) => ({
      ...sentence,
      tokens: sentence.tokens.map(this.transformToken),
    })),
    tokens: raw.tokens.map(this.transformToken),
    attestation: this.transformAttestation(raw.runtimeAttestation, languageId),
  });

  private transformAttestation = (
    runtime: SpacyRuntimeAttestation,
    languageId: NormalizedLanguageId,
  ): LanguageAnalysisAttestation => {
    if (normalizeLanguageId(runtime.languageId) !== languageId)
      throw new TypeError(
        "spaCy runtime attestation language does not match the request.",
      );
    return {
      contract: runtime.contract,
      languageId,
      implementation: {
        reference: this.reference,
        packageName: this.packageIdentity.name,
        packageVersion: this.packageIdentity.version,
      },
      generation: runtime.generation,
      semanticConfig: runtime.semanticConfig,
      engine: runtime.engine,
      pipeline: runtime.pipeline,
      model: runtime.model,
      assets: runtime.assets,
    };
  };

  private transformToken = (token: SpacyTokenResponse): LanguageAnalysisToken =>
    token;

  private requireSupportedLanguage(languageId: NormalizedLanguageId) {
    const missing = this.getMissingConfigAvailability();
    if (missing) throw new PluginServiceUnavailableError(missing);
    if (!this.config.languageIds.includes(languageId))
      throw new PluginServiceUnavailableError({
        available: false,
        reason: "disabled-by-runtime",
        message: `spaCy is not configured for ${languageId}.`,
      });
  }

  private rethrow(
    error: unknown,
    callerSignal: AbortSignal | undefined,
    signal: AbortSignal,
  ): never {
    if (callerSignal?.aborted) throw callerSignal.reason;
    if (signal.aborted) throw signal.reason;
    if (error instanceof SpacyServerResponseError) {
      if (error.status === 504)
        throw new DOMException("spaCy server timed out.", "TimeoutError");
      throw new PluginServiceUnavailableError({
        available: false,
        reason: "remote-unreachable",
        message: `spaCy server returned HTTP ${error.status}.`,
      });
    }
    if (error instanceof LanguageAnalysisValidationError) throw error;
    if (error instanceof z.ZodError) {
      const code = error.issues.some((issue) =>
        issue.path.includes("runtimeAttestation"),
      )
        ? "INVALID_ATTESTATION"
        : "INVALID_RESPONSE";
      throw new LanguageAnalysisValidationError(
        code,
        "spaCy response does not match the Language Analysis protocol.",
        { cause: error },
      );
    }
    if (error instanceof SyntaxError) {
      throw new LanguageAnalysisValidationError(
        "INVALID_RESPONSE",
        "spaCy returned malformed JSON.",
        { cause: error },
      );
    }
    if (error instanceof TypeError) {
      throw new LanguageAnalysisValidationError(
        "INVALID_ATTESTATION",
        "spaCy returned an invalid runtime attestation.",
        { cause: error },
      );
    }
    throw new PluginServiceUnavailableError({
      available: false,
      reason: "remote-unreachable",
      message: "spaCy server is unreachable.",
    });
  }

  private getMissingConfigAvailability =
    (): PluginServiceAvailability | null =>
      PLACEHOLDER_SERVER_URLS.has(normalizeServerUrl(this.config.serverUrl))
        ? {
            available: false,
            reason: "missing-config",
            message:
              "spaCy Language Analyzer requires a non-placeholder serverUrl.",
          }
        : null;
}
