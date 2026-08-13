import { and, asc, count, desc, eq, ilike, memory, or } from "@cat/db";
import * as z from "zod";

import type { Query } from "#/types.ts";

export const MemoryListSortSchema = z.strictObject({
  id: z.enum(["name", "createdAt", "updatedAt"]),
  desc: z.boolean(),
});
export type MemoryListSort = z.infer<typeof MemoryListSortSchema>;

const listMemoriesByCreatorBase = {
  creatorId: z.uuidv4(),
  search: z.string().trim().min(1).optional(),
  sort: MemoryListSortSchema.optional(),
};

export const ListMemoriesByCreatorQuerySchema = z.union([
  z.strictObject({
    ...listMemoriesByCreatorBase,
    pageIndex: z.int().min(0),
    pageSize: z.int().min(1).max(100),
  }),
  z.strictObject({
    ...listMemoriesByCreatorBase,
    pagination: z.literal("unpaged"),
  }),
]);

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
  z.input<typeof ListMemoriesByCreatorQuerySchema>,
  ListMemoriesByCreatorResult
> = async (ctx, query) => {
  const parsed = ListMemoriesByCreatorQuerySchema.parse(query);
  const searchPattern =
    parsed.search === undefined
      ? undefined
      : `%${parsed.search.replace(/[\\%_]/g, "\\$&")}%`;
  const filter = and(
    eq(memory.creatorId, parsed.creatorId),
    searchPattern === undefined
      ? undefined
      : or(
          ilike(memory.name, searchPattern),
          ilike(memory.description, searchPattern),
        ),
  );

  const totalResult = await ctx.db
    .select({ count: count() })
    .from(memory)
    .where(filter);

  let dataQuery = ctx.db
    .select({
      id: memory.id,
      name: memory.name,
      description: memory.description,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
    })
    .from(memory)
    .where(filter)
    .orderBy(
      ...(parsed.sort?.desc
        ? [
            desc(
              parsed.sort.id === "name"
                ? memory.name
                : parsed.sort.id === "updatedAt"
                  ? memory.updatedAt
                  : memory.createdAt,
            ),
            desc(memory.id),
          ]
        : [
            asc(
              parsed.sort?.id === "name"
                ? memory.name
                : parsed.sort?.id === "updatedAt"
                  ? memory.updatedAt
                  : memory.createdAt,
            ),
            asc(memory.id),
          ]),
    );

  if ("pageIndex" in parsed) {
    const pagedQuery = dataQuery
      .limit(parsed.pageSize)
      .offset(parsed.pageIndex * parsed.pageSize);

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
