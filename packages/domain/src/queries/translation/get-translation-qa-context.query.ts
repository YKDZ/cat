import {
  alias,
  eq,
  translatableElement,
  translation,
  vectorizedString,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const GetTranslationQaContextQuerySchema = z.object({
  translationId: z.int(),
});

export type GetTranslationQaContextQuery = z.infer<
  typeof GetTranslationQaContextQuerySchema
>;

export type TranslationQaContext = {
  projectId: string;
  translationText: string;
  translationLanguageId: string;
  elementText: string;
  elementLanguageId: string;
};

const translationString = alias(vectorizedString, "translationString");
const elementString = alias(vectorizedString, "elementString");

/**
 * @zh 获取执行翻译 QA 所需的上下文（翻译文本、源文本及语言信息）。
 * @en Fetch the context required to run translation QA (translation text, source text, language info).
 */
export const getTranslationQaContext: Query<
  GetTranslationQaContextQuery,
  TranslationQaContext | null
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({
      projectId: translatableElement.projectId,
      translationText: translationString.value,
      translationLanguageId: translationString.languageId,
      elementText: elementString.value,
      elementLanguageId: elementString.languageId,
    })
    .from(translation)
    .innerJoin(
      translationString,
      eq(translationString.id, translation.stringId),
    )
    .innerJoin(
      translatableElement,
      eq(translatableElement.id, translation.translatableElementId),
    )
    .innerJoin(
      elementString,
      eq(elementString.id, translatableElement.vectorizedStringId),
    )
    .where(eq(translation.id, query.translationId))
    .limit(1);

  return rows[0] ?? null;
};
