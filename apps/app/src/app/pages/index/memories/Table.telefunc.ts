import type { Memory } from "@cat/shared/schema/drizzle/memory";

import { listMemoriesByCreator } from "@cat/domain";

import { runAppQuery } from "@/server/domain";
import { requireTelefuncAuth } from "@/server/telefunc-auth";

export type PagedResult<T> = {
  data: T[];
  total: number;
};

export type MemoryListItem = Pick<
  Memory,
  "id" | "name" | "description" | "createdAt" | "updatedAt"
>;

export const onRequestMemories = async (
  pageIndex: number,
  pageSize: number,
): Promise<PagedResult<MemoryListItem>> => {
  const { auth } = requireTelefuncAuth();
  const { data, total } = await runAppQuery(listMemoriesByCreator, {
    creatorId: auth.subjectId,
    pageIndex,
    pageSize,
  });

  return {
    data,
    total,
  };
};
