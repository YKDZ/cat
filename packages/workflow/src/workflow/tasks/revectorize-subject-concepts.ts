import {
  executeQuery,
  getDbHandle,
  listTermConceptIdsBySubject,
} from "@cat/domain";
import { ServiceImplementationReferenceSchema } from "@cat/shared";
import * as z from "zod";

import { defineNode, defineGraph } from "#/graph/dsl/index.ts";
import { runGraph } from "#/graph/dsl/run-graph.ts";

import { revectorizeConceptGraph } from "./revectorize-concept.ts";

export const RevectorizeSubjectConceptsInputSchema = z.object({
  subjectId: z.int(),
  vectorizer: ServiceImplementationReferenceSchema,
  vectorStorage: ServiceImplementationReferenceSchema,
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
                vectorizer: input.vectorizer,
                vectorStorage: input.vectorStorage,
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
