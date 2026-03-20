import type { OperationContext } from "@cat/domain";

import { firstOrGivenService, resolvePluginManager } from "@cat/server-shared";
import { serverLogger as logger } from "@cat/server-shared";
import * as z from "zod";

// ─── Input / Output Schemas ───

export const LlmTermAlignInputSchema = z.object({
  termGroups: z.array(
    z.object({
      languageId: z.string().min(1),
      candidates: z.array(
        z.object({
          text: z.string(),
          posPattern: z.array(z.string()).nullable().optional(),
          definition: z.string().nullable().optional(),
        }),
      ),
    }),
  ),
  /** Pairs that still need LLM alignment (from unaligned after vector/statistical) */
  unalignedGroupPairs: z.array(
    z.object({
      groupAIndex: z.int(),
      candidateAIndex: z.int(),
      groupBIndex: z.int(),
      candidateBIndex: z.int(),
    }),
  ),
  config: z.object({
    llmProviderId: z.int().optional(),
    batchSize: z.int().min(1).max(50).default(30),
  }),
});

export const LlmTermAlignOutputSchema = z.object({
  alignedPairs: z.array(
    z.object({
      groupAIndex: z.int(),
      candidateAIndex: z.int(),
      groupBIndex: z.int(),
      candidateBIndex: z.int(),
      llmScore: z.number().min(0).max(1),
    }),
  ),
});

export type LlmTermAlignInput = z.infer<typeof LlmTermAlignInputSchema>;
export type LlmTermAlignOutput = z.infer<typeof LlmTermAlignOutputSchema>;

// ─── Types ───

type LlmAlignResult = {
  indexA: number;
  indexB: number;
  aligned: boolean;
  confidence: number;
};

const parseAlignJsonSafe = (text: string): LlmAlignResult[] => {
  const match =
    /```(?:json)?\s*([\s\S]*?)```/.exec(text) ?? /(\[[\s\S]*\])/.exec(text);
  const jsonStr = match?.[1]?.trim() ?? text.trim();

  try {
    const parsed: unknown = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];
    const items: unknown[] = parsed;
    return items.filter((item): item is LlmAlignResult => {
      if (typeof item !== "object" || item === null) return false;
      const rec = item as {
        indexA?: unknown;
        indexB?: unknown;
        aligned?: unknown;
      };
      return (
        typeof rec.indexA === "number" &&
        typeof rec.indexB === "number" &&
        typeof rec.aligned === "boolean"
      );
    });
  } catch {
    return [];
  }
};

const buildAlignPrompt = (
  pairsInBatch: Array<{
    pairIdx: number;
    langA: string;
    termA: string;
    posA: string | null;
    defA: string | null;
    langB: string;
    termB: string;
    posB: string | null;
    defB: string | null;
  }>,
): string => {
  const items = pairsInBatch
    .map((p) => {
      const posA = p.posA ? ` [POS: ${p.posA}]` : "";
      const posB = p.posB ? ` [POS: ${p.posB}]` : "";
      const defA = p.defA ? `\n   Definition: ${p.defA}` : "";
      const defB = p.defB ? `\n   Definition: ${p.defB}` : "";
      return `Pair ${p.pairIdx + 1}:
  A (${p.langA}): "${p.termA}"${posA}${defA}
  B (${p.langB}): "${p.termB}"${posB}${defB}`;
    })
    .join("\n");

  return `You are a multilingual terminology alignment expert.

For each pair below, determine whether term A and term B refer to the same concept.
Return a confidence score between 0 and 1.

Return ONLY a valid JSON array:
[
  {
    "indexA": <pairIdx>,
    "indexB": <pairIdx>,
    "aligned": true/false,
    "confidence": 0.0-1.0
  }
]
Note: indexA and indexB should both equal the pair number (0-based).

${items}`.trim();
};

/**
 * LLM 术语对齐（兜底策略）
 *
 * 对向量对齐和统计对齐未能高置信度处理的候选对进行 LLM 判断。
 */
export const llmTermAlignOp = async (
  data: LlmTermAlignInput,
  ctx?: OperationContext,
): Promise<LlmTermAlignOutput> => {
  const pluginManager = resolvePluginManager(ctx?.pluginManager);
  const llmService = firstOrGivenService(
    pluginManager,
    "LLM_PROVIDER",
    data.config.llmProviderId,
  );

  if (!llmService || data.unalignedGroupPairs.length === 0) {
    return { alignedPairs: [] };
  }

  const llm = llmService.service;

  // Build batches
  const batches = Array.from(
    {
      length: Math.ceil(
        data.unalignedGroupPairs.length / data.config.batchSize,
      ),
    },
    (_, i) =>
      data.unalignedGroupPairs.slice(
        i * data.config.batchSize,
        (i + 1) * data.config.batchSize,
      ),
  );

  const posPatternToStr = (p: string[] | null | undefined): string | null => {
    if (!p || p.length === 0 || p.every((t) => t === "X")) return null;
    return p.join(", ");
  };

  const batchResults = await Promise.all(
    batches.map(async (batch) => {
      const batchItems = batch.map((pair, pairIdx) => {
        const groupA = data.termGroups[pair.groupAIndex];
        const groupB = data.termGroups[pair.groupBIndex];
        const candA = groupA?.candidates[pair.candidateAIndex];
        const candB = groupB?.candidates[pair.candidateBIndex];

        return {
          pairIdx,
          langA: groupA?.languageId ?? "",
          termA: candA?.text ?? "",
          posA: posPatternToStr(candA?.posPattern),
          defA: candA?.definition ?? null,
          langB: groupB?.languageId ?? "",
          termB: candB?.text ?? "",
          posB: posPatternToStr(candB?.posPattern),
          defB: candB?.definition ?? null,
        };
      });

      try {
        const response = await llm.chat({
          messages: [
            {
              role: "system",
              content:
                "You are a multilingual terminology alignment expert. Always respond with valid JSON arrays only.",
            },
            { role: "user", content: buildAlignPrompt(batchItems) },
          ],
          temperature: 0.1,
          maxTokens: 4096,
          thinking: false,
        });

        return {
          batch,
          results: parseAlignJsonSafe(response.content?.trim() ?? ""),
        };
      } catch (err: unknown) {
        logger
          .withSituation("OP")
          .error({ msg: "llmTermAlignOp: LLM batch failed" }, err);
        return { batch, results: [] };
      }
    }),
  );

  const alignedPairs: LlmTermAlignOutput["alignedPairs"] = [];

  for (const { batch, results } of batchResults) {
    for (const result of results) {
      const pair = batch[result.indexA];
      if (!pair || !result.aligned) continue;

      alignedPairs.push({
        groupAIndex: pair.groupAIndex,
        candidateAIndex: pair.candidateAIndex,
        groupBIndex: pair.groupBIndex,
        candidateBIndex: pair.candidateBIndex,
        llmScore: result.confidence ?? 0.7,
      });
    }
  }

  return { alignedPairs };
};
