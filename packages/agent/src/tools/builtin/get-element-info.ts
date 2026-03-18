import { ElementInfoQueryResultSchema, getElementInfo } from "@cat/domain";
import * as z from "zod";

import { runAgentQuery } from "@/db/domain";
import { defineTool } from "@/tools/types";

const InputSchema = z.object({
  elementId: z.int(),
  languageId: z.string().optional().meta({
    description:
      "Filter returned translations to this target language ID. Omit to return translations for all languages.",
  }),
});

const OutputSchema = ElementInfoQueryResultSchema;

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

/**
 * 获取可翻译元素的详细信息，包括源文本和译文列表。
 * 可选按目标语言过滤译文。
 */
const getElementInfoOp = async (data: Input): Promise<Output> => {
  return runAgentQuery(getElementInfo, data);
};

export const getElementInfoTool = defineTool({
  name: "get_element_info",
  description:
    "Retrieve detailed information about a translatable element by its ID. " +
    "Returns the source text, source language, meta, contexts data and all existing translations. " +
    "Use this to inspect what the user is currently translating.",
  parameters: InputSchema,
  execute: async (args) => {
    return getElementInfoOp(args);
  },
});
