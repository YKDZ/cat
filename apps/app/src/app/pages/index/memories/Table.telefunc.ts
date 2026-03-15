import type { Memory } from "@cat/shared/schema/drizzle/memory";

import { listMemoriesByCreator } from "@cat/domain";

import { runAppQuery } from "@/server/domain";

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
  const { data, total } = await runAppQuery(listMemoriesByCreator, {
    creatorId: userId,
    pageIndex,
    pageSize,
  });

  return {
    data,
    total,
  };
};
