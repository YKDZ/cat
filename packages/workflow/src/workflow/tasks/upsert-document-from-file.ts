import {
  executeQuery,
  getDbHandle,
  listElementIdsByDocument,
} from "@cat/domain";
import * as z from "zod";

import { defineNode, defineTypedGraph } from "@/graph/typed-dsl";
import { runGraph } from "@/graph/typed-dsl/run-graph";

import { diffElementsGraph } from "./diff-elements";
import { parseFileGraph } from "./parse-file";

export const UpsertDocumentInputSchema = z.object({
  documentId: z.uuidv4(),
  fileId: z.int(),
  languageId: z.string(),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const UpsertDocumentOutputSchema = z.object({
  success: z.boolean(),
  addedCount: z.int(),
  removedCount: z.int(),
});

export const upsertDocumentGraph = defineTypedGraph({
  id: "document-upsert-from-file",
  input: UpsertDocumentInputSchema,
  output: UpsertDocumentOutputSchema,
  nodes: {
    main: defineNode({
      input: UpsertDocumentInputSchema,
      output: UpsertDocumentOutputSchema,
      handler: async (input, ctx) => {
        const { elements } = await runGraph(
          parseFileGraph,
          { fileId: input.fileId, languageId: input.languageId },
          { signal: ctx.signal },
        );

        const { client: db } = await getDbHandle();
        const oldElementIds = await executeQuery(
          { db },
          listElementIdsByDocument,
          {
            documentId: input.documentId,
          },
        );

        const diffStats = await runGraph(
          diffElementsGraph,
          {
            documentId: input.documentId,
            elementData: elements,
            oldElementIds,
            vectorizerId: input.vectorizerId,
            vectorStorageId: input.vectorStorageId,
          },
          { signal: ctx.signal },
        );

        return {
          success: true,
          addedCount: diffStats.addedElementIds.length,
          removedCount: diffStats.removedElementIds.length,
        };
      },
    }),
  },
  edges: [],
  entry: "main",
  exit: ["main"],
});
