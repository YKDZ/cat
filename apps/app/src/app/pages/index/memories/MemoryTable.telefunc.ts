import { eq, getDrizzleDB, memory, count } from "@cat/db";
import type { Memory } from "@cat/shared/schema/drizzle/memory";

export type PagedResult<T> = {
  data: T[];
  total: number;
};

export type MemoryListItem = Pick<
  Memory,
  "id" | "name" | "description" | "createdAt" | "updatedAt"
>;

export const onRequestMemories = async (
  userId: string,
  pageIndex: number,
  pageSize: number,
): Promise<PagedResult<MemoryListItem>> => {
  const { client: drizzle } = await getDrizzleDB();

  // 查询总数
  const totalResult = await drizzle
    .select({ count: count() })
    .from(memory)
    .where(eq(memory.creatorId, userId));

  const total = Number(totalResult[0]?.count ?? 0);

  // 查询数据
  const data = await drizzle
    .select({
      id: memory.id,
      name: memory.name,
      description: memory.description,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
    })
    .from(memory)
    .where(eq(memory.creatorId, userId))
    .orderBy(memory.createdAt)
    .limit(pageSize)
    .offset(pageIndex * pageSize);

  return {
    data,
    total,
  };
};
