import { createElements, executeCommand, getDbHandle } from "@cat/domain";
import { nonNullSafeZDotJson, safeZDotJson } from "@cat/shared/schema/json";
import { zip } from "@cat/shared/utils";
import * as z from "zod/v4";

import { defineNode, defineTypedGraph } from "@/graph/typed-dsl";
import { runGraph } from "@/graph/typed-dsl/run-graph";

import { createTranslatableStringGraph } from "./create-translatable-string";

export const CreateElementInputSchema = z.object({
  data: z.array(
    z.object({
      meta: nonNullSafeZDotJson.optional(),
      creatorId: z.uuidv4().optional(),
      documentId: z.uuidv4(),
      text: z.string(),
      languageId: z.string(),
      sortIndex: z.int().optional(),
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

export const createElementGraph = defineTypedGraph({
  id: "element-create",
  input: CreateElementInputSchema,
  output: CreateElementOutputSchema,
  nodes: {
    main: defineNode({
      input: CreateElementInputSchema,
      output: CreateElementOutputSchema,
      handler: async (input, ctx) => {
        const { stringIds } = await runGraph(
          createTranslatableStringGraph,
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
              meta: element.meta ?? {},
              sortIndex: element.sortIndex ?? 0,
              creatorId: element.creatorId,
              documentId: element.documentId,
              stringId,
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
