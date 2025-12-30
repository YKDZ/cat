import { defineWorkflow } from "@/core";
import { eq, getDrizzleDB, translatableElement } from "@cat/db";
import z from "zod";
import { parseFileTask } from "./parse-file";
import { diffElementsTask } from "./diff-elements";

export const UpsertDocumentInputSchema = z.object({
  documentId: z.uuidv4(),
  documentVersionId: z.int(),
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

  dependencies: (data, { traceId }) => [
    parseFileTask.asChild(
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

    // 获取当前文档的旧元素 ID (逻辑从 Diff 移出，保持 Diff 纯粹接受 IDs)
    // 或者，Diff Task 也可以自己查，但为了复用性，调用者传递 ID 集合更好
    const oldElementIds = (
      await drizzle
        .select({ id: translatableElement.id })
        .from(translatableElement)
        .where(eq(translatableElement.documentId, data.documentId))
    ).map((el) => el.id);

    // 显式调用 Diff Task
    const { result: diffResult } = await diffElementsTask.run(
      {
        documentId: data.documentId,
        documentVersionId: data.documentVersionId,
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
