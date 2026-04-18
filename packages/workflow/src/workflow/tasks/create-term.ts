import { createGlossaryTerms, executeCommand, getDbHandle } from "@cat/domain";
import { TermDataSchema } from "@cat/shared/schema/misc";
import * as z from "zod";

import { generateCacheKey } from "@/graph/cache";
import { defineNode, defineTypedGraph } from "@/graph/typed-dsl";
import { runGraph } from "@/graph/typed-dsl/run-graph";

import { revectorizeConceptGraph } from "./revectorize-concept";

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

export const createTermGraph = defineTypedGraph({
  id: "term-create",
  input: CreateTermInputSchema,
  output: CreateTermOutputSchema,
  nodes: {
    main: defineNode({
      input: CreateTermInputSchema,
      output: CreateTermOutputSchema,
      handler: async (input, ctx) => {
        const sideEffectKey = `terms:${input.glossaryId}:${generateCacheKey(input.data)}`;
        const existing = await ctx.checkSideEffect<number[]>(sideEffectKey);
        if (existing !== null) {
          return { termIds: existing };
        }

        const { client: db } = await getDbHandle();
        const { termIds, conceptIds } = await db.transaction(async (tx) => {
          return executeCommand({ db: tx }, createGlossaryTerms, {
            glossaryId: input.glossaryId,
            creatorId: input.creatorId,
            data: input.data,
          });
        });

        await Promise.all(
          conceptIds.map(async (conceptId) => {
            await runGraph(
              revectorizeConceptGraph,
              {
                conceptId,
                vectorizerId: input.vectorizerId,
                vectorStorageId: input.vectorStorageId,
              },
              { signal: ctx.signal },
            );
          }),
        );

        await ctx.recordSideEffect(sideEffectKey, "db_write", termIds);

        return { termIds };
      },
    }),
  },
  edges: [],
  entry: "main",
  exit: ["main"],
});
