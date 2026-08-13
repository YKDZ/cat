import { and, asc, count, desc, eq, glossary, ilike, or } from "@cat/db";
import * as z from "zod";

import type { Query } from "#/types.ts";

export const GlossaryListSortSchema = z.strictObject({
  id: z.enum(["name", "createdAt", "updatedAt"]),
  desc: z.boolean(),
});
export type GlossaryListSort = z.infer<typeof GlossaryListSortSchema>;

const listGlossariesByCreatorBase = {
  creatorId: z.uuidv4(),
  search: z.string().trim().min(1).optional(),
  sort: GlossaryListSortSchema.optional(),
};

export const ListGlossariesByCreatorQuerySchema = z.union([
  z.strictObject({
    ...listGlossariesByCreatorBase,
    pageIndex: z.int().min(0),
    pageSize: z.int().min(1).max(100),
  }),
  z.strictObject({
    ...listGlossariesByCreatorBase,
    pagination: z.literal("unpaged"),
  }),
]);

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
  z.input<typeof ListGlossariesByCreatorQuerySchema>,
  ListGlossariesByCreatorResult
> = async (ctx, query) => {
  const parsed = ListGlossariesByCreatorQuerySchema.parse(query);
  const searchPattern =
    parsed.search === undefined
      ? undefined
      : `%${parsed.search.replace(/[\\%_]/g, "\\$&")}%`;
  const filter = and(
    eq(glossary.creatorId, parsed.creatorId),
    searchPattern === undefined
      ? undefined
      : or(
          ilike(glossary.name, searchPattern),
          ilike(glossary.description, searchPattern),
        ),
  );

  const totalResult = await ctx.db
    .select({ count: count() })
    .from(glossary)
    .where(filter);

  let dataQuery = ctx.db
    .select({
      id: glossary.id,
      name: glossary.name,
      description: glossary.description,
      createdAt: glossary.createdAt,
      updatedAt: glossary.updatedAt,
    })
    .from(glossary)
    .where(filter)
    .orderBy(
      ...(parsed.sort?.desc
        ? [
            desc(
              parsed.sort.id === "name"
                ? glossary.name
                : parsed.sort.id === "updatedAt"
                  ? glossary.updatedAt
                  : glossary.createdAt,
            ),
            desc(glossary.id),
          ]
        : [
            asc(
              parsed.sort?.id === "name"
                ? glossary.name
                : parsed.sort?.id === "updatedAt"
                  ? glossary.updatedAt
                  : glossary.createdAt,
            ),
            asc(glossary.id),
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
