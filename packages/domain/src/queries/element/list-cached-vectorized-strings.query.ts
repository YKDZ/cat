import { and, eq, or, vectorizedString } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListCachedVectorizedStringsQuerySchema = z.object({
  items: z.array(
    z.object({
      text: z.string(),
      languageId: z.string(),
    }),
  ),
});

export type ListCachedVectorizedStringsQuery = z.infer<
  typeof ListCachedVectorizedStringsQuerySchema
>;

export type CachedVectorizedString = {
  id: number;
  value: string;
  languageId: string;
};

export const listCachedVectorizedStrings: Query<
  ListCachedVectorizedStringsQuery,
  CachedVectorizedString[]
> = async (ctx, query) => {
  if (query.items.length === 0) {
    return [];
  }

  const whereConditions = query.items.map((item) =>
    and(
      eq(vectorizedString.value, item.text),
      eq(vectorizedString.languageId, item.languageId),
    ),
  );

  return ctx.db
    .select({
      id: vectorizedString.id,
      value: vectorizedString.value,
      languageId: vectorizedString.languageId,
    })
    .from(vectorizedString)
    .where(
      whereConditions.length === 1
        ? whereConditions[0]
        : or(...whereConditions),
    );
};
