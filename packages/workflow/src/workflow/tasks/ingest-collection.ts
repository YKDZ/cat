import type { CollectionPayload } from "@cat/shared";

import {
  createDocumentUnderParent,
  executeCommand,
  executeQuery,
  findProjectDocumentByName,
  getDbHandle,
  insertElementContexts,
  listElementIdsByDocument,
  listElementsForDiff,
} from "@cat/domain";
import { CollectionPayloadSchema } from "@cat/shared";
import { isDeepStrictEqual } from "node:util";
import * as z from "zod";

import { defineGraph, defineNode } from "@/graph/dsl";
import { runGraph } from "@/graph/dsl/run-graph";

import { diffElementsGraph } from "./diff-elements";

export const IngestCollectionInputSchema = z.object({
  payload: CollectionPayloadSchema,
  userId: z.string(),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
  fileHandlerDbId: z.int().nullable(),
});

export const IngestCollectionOutputSchema = z.object({
  documentId: z.uuidv4(),
  addedCount: z.int(),
  removedCount: z.int(),
  updatedCount: z.int(),
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
        const payload = input.payload;
        const { client: db } = await getDbHandle();

        // 1. Find or create Document
        const existingDoc = await executeQuery(
          { db },
          findProjectDocumentByName,
          {
            projectId: payload.projectId,
            name: payload.document.name,
            isDirectory: false,
          },
        );

        let documentId: string;

        if (existingDoc) {
          documentId = existingDoc.id;
        } else {
          const newDoc = await createDocumentUnderParent(db, {
            name: payload.document.name,
            projectId: payload.projectId,
            creatorId: input.userId,
            fileHandlerId: input.fileHandlerDbId,
          });
          documentId = newDoc.id;
        }

        // 2. Build elementData for diffElements
        const elementData = payload.elements.map((el, index) => ({
          text: el.text,
          sortIndex: el.sortIndex ?? index,
          languageId: payload.sourceLanguageId,
          meta: el.meta,
          sourceStartLine: el.location?.startLine ?? null,
          sourceEndLine: el.location?.endLine ?? null,
          sourceLocationMeta: el.location?.custom ?? null,
        }));

        // 3. Get old element IDs
        const oldElementIds = await executeQuery(
          { db },
          listElementIdsByDocument,
          { documentId },
        );

        // 4. Run diffElements
        const diffResult = await runGraph(
          diffElementsGraph,
          {
            documentId,
            elementData,
            oldElementIds,
            vectorizerId: input.vectorizerId,
            vectorStorageId: input.vectorStorageId,
          },
          { signal: ctx.signal },
        );

        // 5. Insert contexts (if any)
        if (payload.contexts.length > 0) {
          const currentElementIds = await executeQuery(
            { db },
            listElementIdsByDocument,
            { documentId },
          );

          const currentElements = await executeQuery(
            { db },
            listElementsForDiff,
            { elementIds: currentElementIds },
          );

          // Build ref → meta map from payload elements
          const refToMeta = new Map<string, unknown>();
          for (const el of payload.elements) {
            refToMeta.set(el.ref, el.meta);
          }

          const contextInserts: {
            type: string;
            translatableElementId: number;
            textData?: string | null;
            jsonData?: unknown;
            fileId?: number | null;
            storageProviderId?: number | null;
          }[] = [];

          for (const context of payload.contexts) {
            const meta = refToMeta.get(context.elementRef);
            if (meta === undefined) continue;

            const matchingElement = currentElements.find((el) =>
              isDeepStrictEqual(el.meta, meta),
            );
            if (!matchingElement) continue;

            const insert = buildContextInsert(context, matchingElement.id);
            if (insert) contextInserts.push(insert);
          }

          if (contextInserts.length > 0) {
            await executeCommand({ db }, insertElementContexts, {
              data: contextInserts,
            });
          }
        }

        return {
          documentId,
          addedCount: diffResult.addedElementIds.length,
          removedCount: diffResult.removedElementIds.length,
          updatedCount: 0,
        };
      },
    }),
  },
  edges: [],
  entry: "main",
  exit: ["main"],
});

function buildContextInsert(
  ctx: CollectionPayload["contexts"][number],
  elementId: number,
) {
  const base = {
    translatableElementId: elementId,
    type: ctx.type,
  };

  switch (ctx.type) {
    case "TEXT":
      return { ...base, textData: ctx.data.text };
    case "JSON":
      return { ...base, jsonData: ctx.data.json };
    case "FILE":
      return { ...base, fileId: ctx.data.fileId };
    case "MARKDOWN":
      return { ...base, textData: ctx.data.markdown };
    case "URL":
      return { ...base, textData: ctx.data.url };
    case "IMAGE":
      return {
        ...base,
        fileId: ctx.data.fileId,
        jsonData: ctx.data.highlightRegion ?? null,
      };
    default:
      return null;
  }
}
