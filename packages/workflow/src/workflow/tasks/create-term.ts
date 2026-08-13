import {
  createGlossaryTerms,
  createInProcessCollector,
  domainEventBus,
  executeCommand,
  getDbHandle,
} from "@cat/domain";
import {
  ServiceImplementationReferenceSchema,
  RecallDerivationReferenceSchema,
  TermDataSchema,
} from "@cat/shared";
import * as z from "zod";

import { generateCacheKey } from "#/graph/cache.ts";
import { defineNode, defineGraph } from "#/graph/dsl/index.ts";

export const CreateTermInputSchema = z.object({
  glossaryId: z.uuidv4(),
  creatorId: z.uuidv4().optional(),
  data: z.array(TermDataSchema),
  vectorizer: ServiceImplementationReferenceSchema,
  vectorStorage: ServiceImplementationReferenceSchema,
});

export const CreateTermOutputSchema = z.object({
  termIds: z.array(z.int()),
  derivations: z.array(RecallDerivationReferenceSchema),
});

export const createTermGraph = defineGraph({
  id: "term-create",
  input: CreateTermInputSchema,
  output: CreateTermOutputSchema,
  nodes: {
    main: defineNode({
      input: CreateTermInputSchema,
      output: CreateTermOutputSchema,
      handler: async (input, ctx) => {
        const sideEffectKey = `terms:${input.glossaryId}:${generateCacheKey(input.data)}`;
        const existing =
          await ctx.checkSideEffect<z.infer<typeof CreateTermOutputSchema>>(
            sideEffectKey,
          );
        if (existing !== null) {
          return existing;
        }

        const { client: db } = await getDbHandle();
        const collector = createInProcessCollector(domainEventBus);
        const { termIds, derivations } = await db.transaction(async (tx) => {
          return executeCommand({ db: tx, collector }, createGlossaryTerms, {
            glossaryId: input.glossaryId,
            creatorId: input.creatorId,
            data: input.data,
          });
        });
        await collector.flush();

        const result = { termIds, derivations };
        await ctx.recordSideEffect(sideEffectKey, "db_write", result);

        return result;
      },
    }),
  },
  edges: [],
  entry: "main",
  exit: ["main"],
});
