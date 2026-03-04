import {
  and,
  asc,
  eq,
  getDrizzleDB,
  sql,
  translatableElement,
  translatableElementContext,
  translatableString,
  translation,
} from "@cat/db";
import {
  TranslatableElementContextSchema,
  type TranslatableElementContext,
} from "@cat/shared/schema/drizzle/document";
import { safeZDotJson } from "@cat/shared/schema/json";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import { defineTool } from "@/tools/types";

const InputSchema = z.object({
  elementId: z.int(),
  languageId: z.string().optional().meta({
    description:
      "Filter returned translations to this target language ID. Omit to return translations for all languages.",
  }),
});

const OutputSchema = z.object({
  elementId: z.int(),
  documentId: z.string(),
  sourceText: z.string(),
  sourceLanguageId: z.string(),
  sortIndex: z.int().nullable(),
  contexts: z.array(
    TranslatableElementContextSchema.pick({
      fileId: true,
      storageProviderId: true,
      type: true,
      jsonData: true,
      textData: true,
    }),
  ),
  meta: safeZDotJson,
  translations: z.array(
    z.object({
      translationId: z.int(),
      text: z.string(),
      languageId: z.string(),
      isApproved: z.boolean(),
    }),
  ),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

/**
 * 获取可翻译元素的详细信息，包括源文本和译文列表。
 * 可选按目标语言过滤译文。
 */
const getElementInfoOp = async (data: Input): Promise<Output> => {
  const { client: drizzle } = await getDrizzleDB();

  const contextsSubquery = drizzle
    .select({
      elementId: translatableElementContext.translatableElementId,
      // Explicitly enumerate columns — getColumns() cannot be interpolated into
      // json_build_object() because it returns a plain Record<string, Column>
      // object, which Drizzle's sql template tag cannot expand as alternating
      // key/value pairs.
      contextsArray: sql<TranslatableElementContext[]>`json_agg(
          json_build_object(
            'type',                  ${translatableElementContext.type},
            'jsonData',              ${translatableElementContext.jsonData},
            'fileId',                ${translatableElementContext.fileId},
            'storageProviderId',     ${translatableElementContext.storageProviderId},
            'textData',              ${translatableElementContext.textData}
          )
        )`.as("contexts_array"),
    })
    .from(translatableElementContext)
    .groupBy(translatableElementContext.translatableElementId)
    .as("contexts_subquery");

  // Fetch the element with its source string
  const element = assertSingleNonNullish(
    await drizzle
      .select({
        elementId: translatableElement.id,
        documentId: translatableElement.documentId,
        sortIndex: translatableElement.sortIndex,
        approvedTranslationId: translatableElement.approvedTranslationId,
        sourceText: translatableString.value,
        sourceLanguageId: translatableString.languageId,
        meta: translatableElement.meta,
        contexts: contextsSubquery.contextsArray,
      })
      .from(translatableElement)
      .innerJoin(
        translatableString,
        eq(translatableElement.translatableStringId, translatableString.id),
      )
      .leftJoin(
        contextsSubquery,
        eq(contextsSubquery.elementId, translatableElement.id),
      )
      .where(eq(translatableElement.id, data.elementId))
      .limit(1),
    `Element with ID ${data.elementId} not found`,
  );

  // Fetch translations for this element
  const translationConditions = [
    eq(translation.translatableElementId, data.elementId),
  ];
  if (data.languageId) {
    translationConditions.push(
      eq(translatableString.languageId, data.languageId),
    );
  }

  const translationRows = await drizzle
    .select({
      translationId: translation.id,
      text: translatableString.value,
      languageId: translatableString.languageId,
    })
    .from(translation)
    .innerJoin(
      translatableString,
      eq(translation.stringId, translatableString.id),
    )
    .where(and(...translationConditions))
    .orderBy(asc(translation.createdAt));

  return {
    ...element,
    translations: translationRows.map((r) => ({
      translationId: r.translationId,
      text: r.text,
      languageId: r.languageId,
      isApproved: element.approvedTranslationId === r.translationId,
    })),
  };
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
