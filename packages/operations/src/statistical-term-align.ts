import type { OperationContext } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import { executeQuery, listTranslationsByElement } from "@cat/domain";
import { serverLogger as logger } from "@cat/server-shared";
import * as z from "zod";

import { nlpBatchSegmentOp } from "./nlp-batch-segment";

// ─── Input / Output Schemas ───

export const StatisticalTermAlignInputSchema = z.object({
  termGroups: z.array(
    z.object({
      languageId: z.string().min(1),
      candidates: z.array(
        z.object({
          text: z.string(),
          normalizedText: z.string().optional(),
          occurrences: z
            .array(
              z.object({
                elementId: z.int(),
                translationId: z.int().optional(),
                ranges: z.array(z.object({ start: z.int(), end: z.int() })),
              }),
            )
            .optional(),
        }),
      ),
    }),
  ),
  config: z.object({
    minCoOccurrence: z.number().min(0).max(1).default(0.3),
  }),
  nlpSegmenterId: z.int().optional(),
});

export const StatisticalTermAlignOutputSchema = z.object({
  alignedPairs: z.array(
    z.object({
      groupAIndex: z.int(),
      candidateAIndex: z.int(),
      groupBIndex: z.int(),
      candidateBIndex: z.int(),
      coOccurrenceScore: z.number().min(0).max(1),
    }),
  ),
});

export type StatisticalTermAlignInput = z.infer<
  typeof StatisticalTermAlignInputSchema
>;
export type StatisticalTermAlignOutput = z.infer<
  typeof StatisticalTermAlignOutputSchema
>;

// ─── Co-occurrence logic ───

type OccurrenceRef = { elementId: number; translationId?: number };

const getOccurrenceKey = (ref: OccurrenceRef): string =>
  ref.translationId !== undefined
    ? `t:${ref.translationId}`
    : `e:${ref.elementId}`;

const computeCoOccurrence = (
  aRefs: OccurrenceRef[],
  bRefs: OccurrenceRef[],
): number => {
  if (aRefs.length === 0 || bRefs.length === 0) return 0;
  const setA = new Set(aRefs.map(getOccurrenceKey));
  const setB = new Set(bRefs.map(getOccurrenceKey));
  let intersection = 0;
  for (const key of setA) {
    if (setB.has(key)) intersection += 1;
  }
  return intersection / Math.min(setA.size, setB.size);
};

/**
 * 尝试在翻译文本中定位候选术语，以获取 translationId 级别的共现信息
 * 通过 NLP segmentation 匹配 lemma 序列，处理词形变化
 */
const enrichFromTranslation = async (
  elementId: number,
  candidateText: string,
  languageId: string,
  nlpSegmenterId: number | undefined,
  ctx?: OperationContext,
): Promise<number[]> => {
  try {
    const { client: drizzle } = await getDbHandle();
    const translations = await executeQuery(
      { db: drizzle },
      listTranslationsByElement,
      { elementId, languageId },
    );

    if (translations.length === 0) return [];

    // Use NLP to find the candidate lemma sequence in the translation
    const segResult = await nlpBatchSegmentOp(
      {
        items: translations.map((t) => ({
          id: String(t.id),
          text: t.text,
        })),
        languageId,
        nlpSegmenterId,
      },
      ctx,
    );

    const candidateLemma = candidateText.toLowerCase();
    const matchingTranslationIds: number[] = [];

    for (const { id, result } of segResult.results) {
      const translationId = parseInt(id, 10);
      if (Number.isNaN(translationId)) continue;

      // Build lemma string from non-stop non-punct tokens
      const contentTokens = result.tokens.filter((t) => !t.isPunct);
      const lemmaString = contentTokens.map((t) => t.lemma).join(" ");

      if (lemmaString.includes(candidateLemma)) {
        matchingTranslationIds.push(translationId);
      }
    }

    return matchingTranslationIds;
  } catch (err: unknown) {
    logger.withSituation("OP").warn({
      msg: "statisticalTermAlignOp: failed to enrich from translation",
      err,
    });
    return [];
  }
};

/**
 * 统计共现术语对齐
 *
 * 利用 CAT 系统天然的翻译对关系进行共现比对:
 * - 优先利用翻译对关系（translationId 级别）
 * - 若无翻译，回退到元素级共现（elementId 级别）
 */
export const statisticalTermAlignOp = async (
  data: StatisticalTermAlignInput,
  ctx?: OperationContext,
): Promise<StatisticalTermAlignOutput> => {
  if (data.termGroups.length < 2) {
    return { alignedPairs: [] };
  }

  // Build list of (group, candidate) pairs with their raw occurrences
  type PendingItem = {
    gi: number;
    ci: number;
    languageId: string;
    candidateText: string;
    rawOccurrences: Array<{
      elementId: number;
      translationId?: number;
    }>;
  };

  const pendingItems: PendingItem[] = [];

  for (let gi = 0; gi < data.termGroups.length; gi += 1) {
    const group = data.termGroups[gi];
    if (!group) continue;

    for (let ci = 0; ci < group.candidates.length; ci += 1) {
      const candidate = group.candidates[ci];
      if (!candidate) continue;

      pendingItems.push({
        gi,
        ci,
        languageId: group.languageId,
        candidateText: candidate.normalizedText ?? candidate.text,
        rawOccurrences: candidate.occurrences ?? [],
      });
    }
  }

  // Enrich all candidates in parallel — one Promise per (candidate × occurrence) enrichment
  const allOccurrences = await Promise.all(
    pendingItems.map(async (item) => {
      const enrichedOccurrences: OccurrenceRef[] = await Promise.all(
        item.rawOccurrences.map(async (occ) => {
          if (occ.translationId !== undefined) {
            return [
              { elementId: occ.elementId, translationId: occ.translationId },
            ];
          }
          const translationIds = await enrichFromTranslation(
            occ.elementId,
            item.candidateText,
            item.languageId,
            data.nlpSegmenterId,
            ctx,
          );
          if (translationIds.length > 0) {
            return translationIds.map((tid) => ({
              elementId: occ.elementId,
              translationId: tid,
            }));
          }
          return [{ elementId: occ.elementId }];
        }),
      ).then((nested) => nested.flat());

      return {
        groupIndex: item.gi,
        candidateIndex: item.ci,
        languageId: item.languageId,
        occurrences: enrichedOccurrences,
      };
    }),
  );

  // Cross-group pair comparison
  const alignedPairs: StatisticalTermAlignOutput["alignedPairs"] = [];

  for (let ai = 0; ai < data.termGroups.length; ai += 1) {
    for (let bi = ai + 1; bi < data.termGroups.length; bi += 1) {
      const groupARefs = allOccurrences.filter((o) => o.groupIndex === ai);
      const groupBRefs = allOccurrences.filter((o) => o.groupIndex === bi);

      for (const occA of groupARefs) {
        for (const occB of groupBRefs) {
          const score = computeCoOccurrence(occA.occurrences, occB.occurrences);
          if (score >= data.config.minCoOccurrence) {
            alignedPairs.push({
              groupAIndex: ai,
              candidateAIndex: occA.candidateIndex,
              groupBIndex: bi,
              candidateBIndex: occB.candidateIndex,
              coOccurrenceScore: score,
            });
          }
        }
      }
    }
  }

  return { alignedPairs };
};
