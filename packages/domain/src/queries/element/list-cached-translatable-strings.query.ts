import { and, eq, or, translatableString } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListCachedTranslatableStringsQuerySchema = z.object({
  items: z.array(
    z.object({
      text: z.string(),
      languageId: z.string(),
    }),
  ),
});

export type ListCachedTranslatableStringsQuery = z.infer<
  typeof ListCachedTranslatableStringsQuerySchema
>;

export type CachedTranslatableString = {
  id: number;
  value: string;
  languageId: string;
};

export const listCachedTranslatableStrings: Query<
  ListCachedTranslatableStringsQuery,
  CachedTranslatableString[]
> = async (ctx, query) => {
  if (query.items.length === 0) {
    return [];
  }

  const whereConditions = query.items.map((item) =>
    and(
      eq(translatableString.value, item.text),
      eq(translatableString.languageId, item.languageId),
    ),
  );

  return ctx.db
    .select({
      id: translatableString.id,
      value: translatableString.value,
      languageId: translatableString.languageId,
    })
    .from(translatableString)
    .where(
      whereConditions.length === 1
        ? whereConditions[0]
        : or(...whereConditions),
    );
};
