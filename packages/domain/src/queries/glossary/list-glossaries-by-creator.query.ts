import { asc, count, eq, glossary } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListGlossariesByCreatorQuerySchema = z.object({
  creatorId: z.uuidv4(),
  pageIndex: z.int().min(0).optional(),
  pageSize: z.int().min(1).optional(),
});

export type ListGlossariesByCreatorQuery = z.infer<
  typeof ListGlossariesByCreatorQuerySchema
>;

export type ListGlossariesByCreatorResult = {
  data: Array<
    Pick<
      typeof glossary.$inferSelect,
      "id" | "name" | "description" | "createdAt" | "updatedAt"
    >
  >;
  total: number;
};

export const listGlossariesByCreator: Query<
  ListGlossariesByCreatorQuery,
  ListGlossariesByCreatorResult
> = async (ctx, query) => {
  const totalResult = await ctx.db
    .select({ count: count() })
    .from(glossary)
    .where(eq(glossary.creatorId, query.creatorId));

  let dataQuery = ctx.db
    .select({
      id: glossary.id,
      name: glossary.name,
      description: glossary.description,
      createdAt: glossary.createdAt,
      updatedAt: glossary.updatedAt,
    })
    .from(glossary)
    .where(eq(glossary.creatorId, query.creatorId))
    .orderBy(asc(glossary.createdAt));

  if (query.pageIndex !== undefined && query.pageSize !== undefined) {
    const pagedQuery = dataQuery
      .limit(query.pageSize)
      .offset(query.pageIndex * query.pageSize);

    return {
      data: await pagedQuery,
      total: Number(totalResult[0]?.count ?? 0),
    };
  }

  return {
    data: await dataQuery,
    total: Number(totalResult[0]?.count ?? 0),
  };
};
