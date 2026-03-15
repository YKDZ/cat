import { createGlossaryTerms, executeCommand } from "@cat/domain";
import { TermDataSchema } from "@cat/shared/schema/misc";
import * as z from "zod/v4";

import { withAgentDrizzleTransaction } from "@/db/domain";
import { generateCacheKey } from "@/graph/cache";
import { defineGraphWorkflow } from "@/workflow/define-task";

import { revectorizeConceptTask } from "./revectorize-concept";

export const CreateTermInputSchema = z.object({
  glossaryId: z.uuidv4(),
  creatorId: z.uuidv4().optional(),
  data: z.array(TermDataSchema),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const CreateTermOutputSchema = z.object({
  termIds: z.array(z.int()),
});

export const createTermTask = defineGraphWorkflow({
  name: "term.create",
  input: CreateTermInputSchema,
  output: CreateTermOutputSchema,
  steps: async () => [],
  handler: async (payload, ctx) => {
    const sideEffectKey = `terms:${payload.glossaryId}:${generateCacheKey(payload.data)}`;
    const existing = await ctx.checkSideEffect<number[]>(sideEffectKey);
    if (existing !== null) {
      return { termIds: existing };
    }

    const { termIds, conceptIds } = await withAgentDrizzleTransaction(
      async (tx) => {
        return executeCommand({ db: tx }, createGlossaryTerms, {
          glossaryId: payload.glossaryId,
          creatorId: payload.creatorId,
          data: payload.data,
        });
      },
    );

    await Promise.all(
      conceptIds.map(async (conceptId) => {
        const { result } = await revectorizeConceptTask.run(
          {
            conceptId,
            vectorizerId: payload.vectorizerId,
            vectorStorageId: payload.vectorStorageId,
          },
          {
            runId: ctx.runId,
            traceId: ctx.traceId,
            signal: ctx.signal,
            pluginManager: ctx.pluginManager,
          },
        );

        await result();
      }),
    );

    await ctx.recordSideEffect(sideEffectKey, "db_write", termIds);

    return { termIds };
  },
});
