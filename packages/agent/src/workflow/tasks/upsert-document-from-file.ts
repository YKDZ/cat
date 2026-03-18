import { listElementIdsByDocument } from "@cat/domain";
import * as z from "zod/v4";

import { runAgentQuery } from "@/db/domain";
import { defineGraphWorkflow } from "@/workflow/define-task";

import { diffElementsTask } from "./diff-elements";
import { parseFileTask } from "./parse-file";

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

export const upsertDocumentFromFileWorkflow = defineGraphWorkflow({
  name: "document.upsert-from-file",
  input: UpsertDocumentInputSchema,
  output: UpsertDocumentOutputSchema,
  steps: async (payload, { traceId, signal }) => {
    return [
      parseFileTask.asStep(
        {
          fileId: payload.fileId,
          languageId: payload.languageId,
        },
        { traceId, signal },
      ),
    ];
  },
  handler: async (payload, ctx) => {
    const [parseResult] = ctx.getStepResult(parseFileTask);

    if (!parseResult) {
      throw new Error("File parsing failed");
    }

    const oldElementIds = await runAgentQuery(listElementIdsByDocument, {
      documentId: payload.documentId,
    });

    const { result } = await diffElementsTask.run(
      {
        documentId: payload.documentId,
        elementData: parseResult.elements,
        oldElementIds,
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

    const diffStats = await result();
    return {
      success: true,
      addedCount: diffStats.addedElementIds.length,
      removedCount: diffStats.removedElementIds.length,
    };
  },
});
