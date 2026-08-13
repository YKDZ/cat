import {
  listMemoriesByCreator,
  MemoryListSortSchema,
  type MemoryListSort,
} from "@cat/domain";
import type { Memory } from "@cat/shared";
import * as z from "zod";

import { runAppQuery } from "#/server/domain.ts";
import { requireTelefuncAuth } from "#/server/telefunc-auth.ts";

export type PagedResult<T> = {
  data: T[];
  total: number;
};

export type MemoryListItem = Pick<
  Memory,
  "id" | "name" | "description" | "createdAt" | "updatedAt"
>;

const MemoryListRequestSchema = z.strictObject({
  pageIndex: z.int().min(0),
  pageSize: z.int().min(1).max(100),
  search: z.string().trim().min(1).nullish(),
  sort: MemoryListSortSchema.optional(),
});

export const onRequestMemories = async (
  pageIndex: number,
  pageSize: number,
  search?: string | null,
  sort?: MemoryListSort,
): Promise<PagedResult<MemoryListItem>> => {
  const request = MemoryListRequestSchema.parse({
    pageIndex,
    pageSize,
    search,
    sort,
  });
  const { auth } = requireTelefuncAuth();
  const { data, total } = await runAppQuery(listMemoriesByCreator, {
    creatorId: auth.subjectId,
    pageIndex: request.pageIndex,
    pageSize: request.pageSize,
    ...(request.search === undefined || request.search === null
      ? {}
      : { search: request.search }),
    ...(request.sort === undefined ? {} : { sort: request.sort }),
  });

  return {
    data,
    total,
  };
};
