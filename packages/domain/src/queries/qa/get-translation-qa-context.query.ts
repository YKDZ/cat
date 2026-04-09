import {
  alias,
  document,
  eq,
  project,
  translatableElement,
  vectorizedString,
  translation,
} from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetTranslationQaContextQuerySchema = z.object({
  translationId: z.int(),
});

export type GetTranslationQaContextQuery = z.infer<
  typeof GetTranslationQaContextQuerySchema
>;

export type TranslationQaContext = {
  elementText: string;
  elementLanguageId: string;
  translationText: string;
  translationLanguageId: string;
  projectId: string;
};

export const getTranslationQaContext: Query<
  GetTranslationQaContextQuery,
  TranslationQaContext | null
> = async (ctx, query) => {
  const translationString = alias(vectorizedString, "translationString");
  const elementString = alias(vectorizedString, "elementString");

  return assertSingleOrNull(
    await ctx.db
      .select({
        elementText: elementString.value,
        elementLanguageId: elementString.languageId,
        translationText: translationString.value,
        translationLanguageId: translationString.languageId,
        projectId: project.id,
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
      .innerJoin(document, eq(document.id, translatableElement.documentId))
      .innerJoin(project, eq(document.projectId, project.id))
      .where(eq(translation.id, query.translationId))
      .limit(1),
  );
};
