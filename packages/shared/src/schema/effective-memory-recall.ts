import * as z from "zod";

import { OperationFailureInputSchema } from "./localization-task.ts";
import {
  MemoryRecallCandidateSchema,
  MemoryRecallResultSchema,
} from "./memory-recall.ts";
import { createCandidateStreamEventSchema } from "./recall.ts";
const scopeOutcomeSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("SUCCEEDED"),
    result: MemoryRecallResultSchema,
  }),
  z.strictObject({
    status: z.literal("BLOCKED"),
    result: MemoryRecallResultSchema,
    failure: OperationFailureInputSchema,
  }),
  z.strictObject({
    status: z.literal("SKIPPED"),
    reason: z.literal("NO_SCOPED_ASSETS"),
  }),
]);
export const EffectiveMemoryRecallResultSchema = z.strictObject({
  scopes: z.strictObject({
    PROJECT: scopeOutcomeSchema,
    PERSONAL: scopeOutcomeSchema,
  }),
});
export const EffectiveMemoryRecallStreamEventSchema =
  createCandidateStreamEventSchema(
    MemoryRecallCandidateSchema,
    EffectiveMemoryRecallResultSchema,
  );
export type EffectiveMemoryRecallResult = z.infer<
  typeof EffectiveMemoryRecallResultSchema
>;
export type EffectiveMemoryRecallStreamEvent = z.infer<
  typeof EffectiveMemoryRecallStreamEventSchema
>;
