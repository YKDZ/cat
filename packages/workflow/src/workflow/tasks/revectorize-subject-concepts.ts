import {
  executeQuery,
  getDbHandle,
  listTermConceptIdsBySubject,
} from "@cat/domain";
import * as z from "zod";

import { defineNode, defineGraph } from "@/graph/dsl";
import { runGraph } from "@/graph/dsl/run-graph";

import { revectorizeConceptGraph } from "./revectorize-concept";

export const RevectorizeSubjectConceptsInputSchema = z.object({
  subjectId: z.int(),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const RevectorizeSubjectConceptsOutputSchema = z.object({
  processedCount: z.int(),
});

export const revectorizeSubjectConceptsGraph = defineGraph({
  id: "term-revectorize-subject-concepts",
  input: RevectorizeSubjectConceptsInputSchema,
  output: RevectorizeSubjectConceptsOutputSchema,
  nodes: {
    main: defineNode({
      input: RevectorizeSubjectConceptsInputSchema,
      output: RevectorizeSubjectConceptsOutputSchema,
      handler: async (input, ctx) => {
        const { client: db } = await getDbHandle();
        const conceptIds = await executeQuery(
          { db },
          listTermConceptIdsBySubject,
          {
            subjectId: input.subjectId,
          },
        );
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
        return { processedCount: conceptIds.length };
      },
    }),
  },
  edges: [],
  entry: "main",
  exit: ["main"],
});
