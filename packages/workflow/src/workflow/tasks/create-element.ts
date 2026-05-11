import { createElements, executeCommand, getDbHandle } from "@cat/domain";
import { nonNullSafeZDotJson, safeZDotJson } from "@cat/shared";
import { zip } from "@cat/shared";
import * as z from "zod";

import { defineNode, defineGraph } from "@/graph/dsl";
import { runGraph } from "@/graph/dsl/run-graph";

import { createVectorizedStringGraph } from "./create-vectorized-string";

export const CreateElementInputSchema = z.object({
  data: z.array(
    z.object({
      projectId: z.uuidv4(),
      primaryContentNodeId: z.uuidv4(),
      importerId: z.string().min(1),
      sourceRootRef: z.string().min(1),
      sourceNodeRef: z.string().min(1),
      stableSourceRef: z.string().min(1),
      meta: nonNullSafeZDotJson.optional(),
      creatorId: z.uuidv4().optional(),
      text: z.string(),
      languageId: z.string(),
      localOrder: z.int().optional(),
      sourceStartLine: z.int().nullable().optional(),
      sourceEndLine: z.int().nullable().optional(),
      sourceLocationMeta: safeZDotJson.optional(),
    }),
  ),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const CreateElementOutputSchema = z.object({
  elementIds: z.array(z.int()),
});

export const createElementGraph = defineGraph({
  id: "element-create",
  input: CreateElementInputSchema,
  output: CreateElementOutputSchema,
  nodes: {
    main: defineNode({
      input: CreateElementInputSchema,
      output: CreateElementOutputSchema,
      handler: async (input, ctx) => {
        const { stringIds } = await runGraph(
          createVectorizedStringGraph,
          {
            data: input.data.map((item) => ({
              text: item.text,
              languageId: item.languageId,
            })),
            vectorizerId: input.vectorizerId,
            vectorStorageId: input.vectorStorageId,
          },
          { signal: ctx.signal },
        );

        const { client: db } = await getDbHandle();
        const elementIds = await executeCommand({ db }, createElements, {
          data: Array.from(zip(input.data, stringIds)).map(
            ([element, stringId]) => ({
              projectId: element.projectId,
              primaryContentNodeId: element.primaryContentNodeId,
              importerId: element.importerId,
              sourceRootRef: element.sourceRootRef,
              sourceNodeRef: element.sourceNodeRef,
              stableSourceRef: element.stableSourceRef,
              meta: element.meta ?? {},
              creatorId: element.creatorId,
              stringId,
              localOrder: element.localOrder,
              sourceStartLine: element.sourceStartLine ?? null,
              sourceEndLine: element.sourceEndLine ?? null,
              sourceLocationMeta: element.sourceLocationMeta ?? null,
            }),
          ),
        });

        return { elementIds };
      },
    }),
  },
  edges: [],
  entry: "main",
  exit: ["main"],
});
