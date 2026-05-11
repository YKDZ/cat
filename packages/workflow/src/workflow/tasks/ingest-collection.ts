import { diffStructuredContentOp } from "@cat/operations";
import { StructuredContentPayloadSchema } from "@cat/shared";
import * as z from "zod";

import { defineGraph, defineNode } from "@/graph/dsl";

export const IngestCollectionInputSchema = z.object({
  payload: StructuredContentPayloadSchema,
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const IngestCollectionOutputSchema = z.object({
  contentNodeIds: z.array(z.uuidv4()),
  addedCount: z.int(),
  removedCount: z.int(),
  updatedCount: z.int(),
  movedCount: z.int(),
  semanticDiffIds: z.array(z.int()),
});

export type IngestCollectionInput = z.infer<typeof IngestCollectionInputSchema>;
export type IngestCollectionOutput = z.infer<
  typeof IngestCollectionOutputSchema
>;

export const ingestCollectionGraph = defineGraph({
  id: "collection-ingest",
  input: IngestCollectionInputSchema,
  output: IngestCollectionOutputSchema,
  nodes: {
    main: defineNode({
      input: IngestCollectionInputSchema,
      output: IngestCollectionOutputSchema,
      handler: async (input, ctx) => {
        const result = await diffStructuredContentOp(
          {
            payload: input.payload,
            vectorizerId: input.vectorizerId,
            vectorStorageId: input.vectorStorageId,
          },
          ctx,
        );

        return {
          contentNodeIds: result.contentNodeIds,
          addedCount: result.addedElementIds.length,
          removedCount: result.removedElementIds.length,
          updatedCount: result.updatedElementIds.length,
          movedCount: result.movedElementIds.length,
          semanticDiffIds: result.semanticDiffIds,
        };
      },
    }),
  },
  edges: [],
  entry: "main",
  exit: ["main"],
});
