import * as z from "zod/v4";

export const NlpTokenSchema = z.object({
  text: z.string(),
  lemma: z.string(),
  pos: z.string(),
  start: z.int().nonnegative(),
  end: z.int().nonnegative(),
  isStop: z.boolean(),
  isPunct: z.boolean(),
});

export const NlpSentenceSchema = z.object({
  text: z.string(),
  tokens: z.array(NlpTokenSchema),
  start: z.int().nonnegative(),
  end: z.int().nonnegative(),
});

export const NlpSegmentResultSchema = z.object({
  sentences: z.array(NlpSentenceSchema),
  tokens: z.array(NlpTokenSchema),
});

export const NlpBatchSegmentResultSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      result: NlpSegmentResultSchema,
    }),
  ),
});

export type NlpToken = z.infer<typeof NlpTokenSchema>;
export type NlpSentence = z.infer<typeof NlpSentenceSchema>;
export type NlpSegmentResult = z.infer<typeof NlpSegmentResultSchema>;
export type NlpBatchSegmentResult = z.infer<typeof NlpBatchSegmentResultSchema>;
