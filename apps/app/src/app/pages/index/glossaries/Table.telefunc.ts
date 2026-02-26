import type { Glossary } from "@cat/shared/schema/drizzle/glossary";

import { eq, getDrizzleDB, glossary, count } from "@cat/db";

export type PagedResult<T> = {
  data: T[];
  total: number;
};

export type GlossaryListItem = Pick<
  Glossary,
  "id" | "name" | "description" | "createdAt" | "updatedAt"
>;

export const onRequestGlossaries = async (
  userId: string,
  pageIndex: number,
  pageSize: number,
): Promise<PagedResult<GlossaryListItem>> => {
  const { client: drizzle } = await getDrizzleDB();

  // 查询总数
  const totalResult = await drizzle
    .select({ count: count() })
    .from(glossary)
    .where(eq(glossary.creatorId, userId));

  const total = Number(totalResult[0]?.count ?? 0);

  // 查询数据
  const data = await drizzle
    .select({
      id: glossary.id,
      name: glossary.name,
      description: glossary.description,
      createdAt: glossary.createdAt,
      updatedAt: glossary.updatedAt,
    })
    .from(glossary)
    .where(eq(glossary.creatorId, userId))
    .orderBy(glossary.createdAt)
    .limit(pageSize)
    .offset(pageIndex * pageSize);

  return {
    data,
    total,
  };
};
