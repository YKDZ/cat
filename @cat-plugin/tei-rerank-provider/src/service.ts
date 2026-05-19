import type { RerankProviderCall, RerankResponse } from "@cat/shared";

import {
  PluginServiceUnavailableError,
  RerankProvider,
  type PluginServiceAvailability,
} from "@cat/plugin-core";
import * as z from "zod";

export const SingleConfigSchema = z.object({
  baseURL: z.string().optional(),
  "model-id": z.string().optional(),
  timeoutMs: z.number().positive().default(3000),
  authorization: z.string().optional(),
});

export type SingleConfig = z.infer<typeof SingleConfigSchema>;

const normalizeConfigValue = (value: string | undefined): string => {
  return value?.trim() ?? "";
};

export const ConfigSchema = z
  .union([SingleConfigSchema, z.array(SingleConfigSchema)])
  .transform((val) => (Array.isArray(val) ? val : [val]));

const TEIResultSchema = z.object({
  index: z.int().min(0),
  score: z.number(),
  text: z.string().nullish(),
});

const TEIResponseSchema = z.array(TEIResultSchema);

export class TEIRerankProvider extends RerankProvider {
  private readonly providerConfig: SingleConfig;

  constructor(config: SingleConfig) {
    super();
    this.providerConfig = config;
  }

  getId(): string {
    const baseURL = normalizeConfigValue(this.providerConfig.baseURL);
    const modelId = this.providerConfig["model-id"];
    return modelId
      ? `tei-rerank:${baseURL || "unconfigured"}:${modelId}`
      : `tei-rerank:${baseURL || "unconfigured"}`;
  }

  getModelName(): string {
    return this.providerConfig["model-id"] ?? "unknown";
  }

  getAvailability(): PluginServiceAvailability {
    return normalizeConfigValue(this.providerConfig.baseURL).length > 0
      ? { available: true, reason: "ok" }
      : {
          available: false,
          reason: "missing-config",
          message: "TEI rerank provider requires a baseURL.",
        };
  }

  async rerank(input: RerankProviderCall): Promise<RerankResponse> {
    const availability = this.getAvailability();
    if (!availability.available) {
      throw new PluginServiceUnavailableError(availability);
    }

    const startedAt = performance.now();
    const timeoutMs = input.request.timeoutMs ?? this.providerConfig.timeoutMs;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = input.signal
      ? AbortSignal.any([input.signal, timeoutSignal])
      : timeoutSignal;

    let response: Response;
    try {
      response = await fetch(new URL("/rerank", this.providerConfig.baseURL), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.providerConfig.authorization
            ? { authorization: this.providerConfig.authorization }
            : {}),
        },
        body: JSON.stringify({
          query: input.request.queryText,
          texts: input.request.candidates.map((c) => c.sourceText),
          raw_scores: false,
        }),
        signal,
      });
    } catch (err) {
      if (timeoutSignal.aborted) {
        const e = new Error(`TEI rerank timed out after ${timeoutMs}ms`);
        (e as NodeJS.ErrnoException).code = "TIMEOUT";
        throw e;
      }
      if (input.signal?.aborted) {
        const e = new Error("TEI rerank cancelled");
        (e as NodeJS.ErrnoException).code = "CANCELLED";
        throw e;
      }
      throw err;
    }

    if (!response.ok) {
      throw new Error(
        `TEI rerank failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = TEIResponseSchema.parse(await response.json());
    const seen = new Set<number>();
    const scores = payload.map((result) => {
      if (seen.has(result.index)) {
        throw new Error(`Duplicate TEI rerank index ${result.index}`);
      }
      seen.add(result.index);
      const candidate = input.request.candidates[result.index];
      if (!candidate) {
        throw new Error(`Out-of-range TEI rerank index ${result.index}`);
      }
      if (!Number.isFinite(result.score)) {
        throw new Error(`Non-finite score at index ${result.index}`);
      }
      return {
        candidateId: candidate.candidateId,
        score: result.score,
      };
    });

    return {
      scores,
      metadata: {
        providerId: this.getId(),
        modelId: this.getModelName(),
        endpoint: this.providerConfig.baseURL,
        latencyMs: performance.now() - startedAt,
        status: "ok",
      },
    };
  }
}
