import {
  getColumns,
  inArray,
  language,
  eq,
  projectTargetLanguage,
} from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetProjectTargetLanguagesQuerySchema = z.object({
  projectId: z.uuidv4(),
});

export type GetProjectTargetLanguagesQuery = z.infer<
  typeof GetProjectTargetLanguagesQuerySchema
>;

export const getProjectTargetLanguages: Query<
  GetProjectTargetLanguagesQuery,
  Array<typeof language.$inferSelect>
> = async (ctx, query) => {
  const ids = (
    await ctx.db
      .select({ languageId: projectTargetLanguage.languageId })
      .from(projectTargetLanguage)
      .where(eq(projectTargetLanguage.projectId, query.projectId))
  ).map((item) => item.languageId);

  if (ids.length === 0) {
    return [];
  }

  return ctx.db
    .select(getColumns(language))
    .from(language)
    .where(inArray(language.id, ids));
};
