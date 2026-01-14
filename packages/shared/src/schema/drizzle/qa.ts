import z from "zod";
import { DrizzleDateTimeSchema } from "../misc";
import { nonNullSafeZDotJson } from "../json";

export const QaResultSchema = z.object({
  id: z.int(),
  translationId: z.int(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const QaResultItemSchema = z.object({
  id: z.int(),
  isPassed: z.boolean(),
  meta: nonNullSafeZDotJson,
  resultId: z.int(),
  checkerId: z.int(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export type QaResult = z.infer<typeof QaResultSchema>;
export type QaResultItem = z.infer<typeof QaResultItemSchema>;
