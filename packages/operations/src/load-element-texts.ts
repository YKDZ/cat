import type { OperationContext } from "@cat/domain";

import { OperationScopeSchema } from "@cat/shared";
import * as z from "zod";

import { resolveOperationScopeElementsOp } from "./resolve-operation-scope-elements";

export const LoadElementTextsInputSchema = OperationScopeSchema.extend({
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
 *
 * 根据批量操作范围批量加载 TranslatableElement 及其 TranslatableString.value，
 * 返回统一格式的文本列表。
 * Batch load element texts.
 *
 * Loads TranslatableElements and their TranslatableString.value in bulk
 * by operation scope, returning a normalized list.
 *
 * @param data - Load input using OperationScope
 * @param ctx - Operation context
 * @returns - Normalized list of element texts
 */
export const loadElementTextsOp = async (
  data: LoadElementTextsInput,
  ctx?: OperationContext,
): Promise<LoadElementTextsOutput> => {
  const { elements } = await resolveOperationScopeElementsOp(
    {
      projectId: data.projectId,
      branchId: data.branchId,
      contentNodeIds: data.contentNodeIds,
      elementIds: data.elementIds,
      sortMode: data.sortMode,
      languageToId: data.sourceLanguageId,
      statusFilter: "all",
      sourceLanguageId: data.sourceLanguageId,
    },
    ctx,
  );

  return {
    elements: elements.map((element) => ({
      elementId: element.id,
      text: element.value,
      languageId: element.languageId,
    })),
  };
};
