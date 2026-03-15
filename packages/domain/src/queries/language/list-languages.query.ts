import { asc, ilike, language } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListLanguagesQuerySchema = z.object({
  page: z.int().min(0).default(0),
  pageSize: z.int().min(1).max(200).default(100),
  searchQuery: z.string().default(""),
});

export type ListLanguagesQuery = z.infer<typeof ListLanguagesQuerySchema>;

export type ListLanguagesResult = {
  languages: Array<typeof language.$inferSelect>;
  hasMore: boolean;
};

export const listLanguages: Query<
  ListLanguagesQuery,
  ListLanguagesResult
> = async (ctx, query) => {
  const dataQuery = ctx.db
    .select()
    .from(language)
    .orderBy(asc(language.id))
    .limit(query.pageSize + 1)
    .offset(query.page * query.pageSize);

  if (query.searchQuery.length > 0) {
    dataQuery.where(ilike(language.id, `%${query.searchQuery}%`));
  }

  const languages = await dataQuery;
  const hasMore = languages.length > query.pageSize;

  if (hasMore) {
    languages.pop();
  }

  return {
    languages,
    hasMore,
  };
};
