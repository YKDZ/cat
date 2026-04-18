import { asc, count, eq, memory } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListMemoriesByCreatorQuerySchema = z.object({
  creatorId: z.uuidv4(),
  pageIndex: z.int().min(0).optional(),
  pageSize: z.int().min(1).optional(),
});

export type ListMemoriesByCreatorQuery = z.infer<
  typeof ListMemoriesByCreatorQuerySchema
>;

export type ListMemoriesByCreatorResult = {
  data: Array<
    Pick<
      typeof memory.$inferSelect,
      "id" | "name" | "description" | "createdAt" | "updatedAt"
    >
  >;
  total: number;
};

export const listMemoriesByCreator: Query<
  ListMemoriesByCreatorQuery,
  ListMemoriesByCreatorResult
> = async (ctx, query) => {
  const totalResult = await ctx.db
    .select({ count: count() })
    .from(memory)
    .where(eq(memory.creatorId, query.creatorId));

  let dataQuery = ctx.db
    .select({
      id: memory.id,
      name: memory.name,
      description: memory.description,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
    })
    .from(memory)
    .where(eq(memory.creatorId, query.creatorId))
    .orderBy(asc(memory.createdAt));

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
