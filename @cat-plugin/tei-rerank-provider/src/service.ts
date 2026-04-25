import type { RerankProviderCall, RerankResponse } from "@cat/shared";

import { RerankProvider } from "@cat/plugin-core";
import * as z from "zod";

const SingleConfigSchema = z.object({
  id: z.string().optional(),
  baseURL: z.string(),
  "model-id": z.string().optional(),
  timeoutMs: z.number().positive().default(3000),
  authorization: z.string().optional(),
});

export type SingleConfig = z.infer<typeof SingleConfigSchema>;

export const ConfigSchema = z
  .union([SingleConfigSchema, z.array(SingleConfigSchema)])
  .transform((val) => (Array.isArray(val) ? val : [val]));

const TEIResultSchema = z.object({
  index: z.int().min(0),
  relevance_score: z.number(),
  document: z.string().optional(),
});

const TEIResponseSchema = z.object({
  results: z.array(TEIResultSchema),
});

export class TEIRerankProvider extends RerankProvider {
  private readonly providerConfig: SingleConfig;

  constructor(config: SingleConfig) {
    super();
    this.providerConfig = config;
  }

  getId(): string {
    return (
      this.providerConfig.id ?? `tei-rerank:${this.providerConfig.baseURL}`
    );
  }

  getModelName(): string {
    return this.providerConfig["model-id"] ?? "unknown";
  }

  async rerank(input: RerankProviderCall): Promise<RerankResponse> {
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
    const scores = payload.results.map((result) => {
      if (seen.has(result.index)) {
        throw new Error(`Duplicate TEI rerank index ${result.index}`);
      }
      seen.add(result.index);
      const candidate = input.request.candidates[result.index];
      if (!candidate) {
        throw new Error(`Out-of-range TEI rerank index ${result.index}`);
      }
      if (!Number.isFinite(result.relevance_score)) {
        throw new Error(`Non-finite relevance_score at index ${result.index}`);
      }
      return {
        candidateId: candidate.candidateId,
        score: result.relevance_score,
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
