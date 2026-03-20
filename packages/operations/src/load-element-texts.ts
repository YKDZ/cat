import type { OperationContext } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import {
  executeQuery,
  listElementIdsByDocument,
  listElements,
} from "@cat/domain";
import * as z from "zod";

export const LoadElementTextsInputSchema = z.object({
  documentIds: z.array(z.uuidv4()).optional(),
  elementIds: z.array(z.int()).optional(),
  /** Source language of the elements */
  sourceLanguageId: z.string().min(1),
});

export const LoadElementTextsOutputSchema = z.object({
  elements: z.array(
    z.object({
      elementId: z.int(),
      text: z.string(),
      languageId: z.string(),
    }),
  ),
});

export type LoadElementTextsInput = z.infer<typeof LoadElementTextsInputSchema>;
export type LoadElementTextsOutput = z.infer<
  typeof LoadElementTextsOutputSchema
>;

/**
 * 加载元素文本
 *
 * 根据 documentIds 或 elementIds 批量加载 TranslatableElement 及其
 * TranslatableString.value，返回统一格式的文本列表。
 */
export const loadElementTextsOp = async (
  data: LoadElementTextsInput,
  _ctx?: OperationContext,
): Promise<LoadElementTextsOutput> => {
  const { client: drizzle } = await getDbHandle();

  // Gather all element IDs
  const allElementIds = new Set<number>(data.elementIds ?? []);

  if (data.documentIds && data.documentIds.length > 0) {
    const docElementIdLists = await Promise.all(
      data.documentIds.map(async (documentId) =>
        executeQuery({ db: drizzle }, listElementIdsByDocument, { documentId }),
      ),
    );
    for (const ids of docElementIdLists) {
      for (const id of ids) {
        allElementIds.add(id);
      }
    }
  }

  if (allElementIds.size === 0) {
    return { elements: [] };
  }

  const rows = await executeQuery({ db: drizzle }, listElements, {
    elementIds: [...allElementIds],
  });

  const elements = rows
    .filter((row) => row.string.languageId === data.sourceLanguageId)
    .map((row) => ({
      elementId: row.element.id,
      text: row.string.value,
      languageId: row.string.languageId,
    }));

  return { elements };
};
