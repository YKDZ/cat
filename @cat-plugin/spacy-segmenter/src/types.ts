import * as z from "zod";

/**
 * spaCy REST API /segment 端点的响应格式（Zod Schema）
 * 与 NlpSegmentResult 几乎一一对应（snake_case），由 FastAPI 端序列化
 */
export const SpacyTokenResponseSchema = z.object({
  text: z.string(),
  lemma: z.string(),
  /** UPOS tag (spaCy token.pos_) */
  pos: z.string(),
  /** 字符起始偏移 (spaCy token.idx) */
  start: z.int().nonnegative(),
  /** 字符结束偏移 (token.idx + len(token.text)) */
  end: z.int().nonnegative(),
  is_stop: z.boolean(),
  is_punct: z.boolean(),
});

export const SpacySentenceResponseSchema = z.object({
  text: z.string(),
  start: z.int().nonnegative(),
  end: z.int().nonnegative(),
  tokens: z.array(SpacyTokenResponseSchema),
});

export const SpacySegmentResponseSchema = z.object({
  sentences: z.array(SpacySentenceResponseSchema),
  tokens: z.array(SpacyTokenResponseSchema),
});

export const SpacyBatchSegmentResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      result: SpacySegmentResponseSchema,
    }),
  ),
});

export const SpacyLanguagesResponseSchema = z.object({
  languages: z.array(z.string()),
});

export type SpacyTokenResponse = z.infer<typeof SpacyTokenResponseSchema>;
export type SpacySentenceResponse = z.infer<typeof SpacySentenceResponseSchema>;
export type SpacySegmentResponse = z.infer<typeof SpacySegmentResponseSchema>;
export type SpacyBatchSegmentResponse = z.infer<
  typeof SpacyBatchSegmentResponseSchema
>;
