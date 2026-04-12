import * as z from "zod/v4";

import { RecallEvidenceSchema } from "@/schema/recall.ts";

// ─── 术语召回通道统一输出 ───

/** 扁平术语匹配结果（所有术语召回通道的直接输出） */
export const TermMatchSchema = z.object({
  term: z.string(),
  translation: z.string(),
  definition: z.string().nullable(),
  conceptId: z.int(),
  glossaryId: z.string(),
  confidence: z.number().min(0).max(1),
  /** Recall evidence entries from all channels that matched this concept. Backward-compatible default: []. */
  evidences: z.array(RecallEvidenceSchema).default([]),
  /** The text fragment that was actually matched (may be a variant). */
  matchedText: z.string().optional(),
});
export type TermMatch = z.infer<typeof TermMatchSchema>;

// ─── Concept 上下文（上层附加） ───

/** Concept 上下文 */
export const ConceptContextSchema = z.object({
  subjects: z.array(
    z.object({
      name: z.string(),
      defaultDefinition: z.string().nullable(),
    }),
  ),
  definition: z.string().nullable(),
});
export type ConceptContext = z.infer<typeof ConceptContextSchema>;

/** 富术语匹配结果（含 concept 上下文，由 API 路由或 Agent 工具附加） */
export const EnrichedTermMatchSchema = TermMatchSchema.extend({
  concept: ConceptContextSchema,
});
export type EnrichedTermMatch = z.infer<typeof EnrichedTermMatchSchema>;
