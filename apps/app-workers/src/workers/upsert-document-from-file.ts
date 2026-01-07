import { defineWorkflow } from "@/core";
import { eq, getDrizzleDB, translatableElement } from "@cat/db";
import * as z from "zod";
import { parseFileTask } from "./parse-file";
import { diffElementsTask } from "./diff-elements";

export const UpsertDocumentInputSchema = z.object({
  documentId: z.uuidv4(),
  fileId: z.int(),
  languageId: z.string(),
});

export const UpsertDocumentOutputSchema = z.object({
  success: z.boolean(),
  addedCount: z.number(),
  removedCount: z.number(),
});

export const upsertDocumentFromFileWorkflow = await defineWorkflow({
  name: "document.upsert-from-file",
  input: UpsertDocumentInputSchema,
  output: UpsertDocumentOutputSchema,

  dependencies: async (data, { traceId }) => [
    await parseFileTask.asChild(
      {
        fileId: data.fileId,
        languageId: data.languageId,
      },
      { traceId },
    ),
  ],

  handler: async (data, { getTaskResult, traceId }) => {
    const { client: drizzle } = await getDrizzleDB();
    const [parseResult] = getTaskResult(parseFileTask);

    if (!parseResult) throw new Error("File parsing failed");

    // 获取当前文档的旧元素 ID
    const oldElementIds = (
      await drizzle
        .select({ id: translatableElement.id })
        .from(translatableElement)
        .where(eq(translatableElement.documentId, data.documentId))
    ).map((el) => el.id);

    const { result: diffResult } = await diffElementsTask.run(
      {
        documentId: data.documentId,
        elementData: parseResult.elements,
        oldElementIds,
      },
      { traceId },
    );

    const diffStats = await diffResult();

    return {
      success: true,
      addedCount: diffStats.addedElementIds.length,
      removedCount: diffStats.removedElementIds.length,
    };
  },
});
