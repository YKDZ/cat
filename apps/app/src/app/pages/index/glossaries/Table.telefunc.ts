import type { Glossary } from "@cat/shared/schema/drizzle/glossary";

import { listGlossariesByCreator } from "@cat/domain";

import { runAppQuery } from "@/server/domain";

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
  const { data, total } = await runAppQuery(listGlossariesByCreator, {
    creatorId: userId,
    pageIndex,
    pageSize,
  });

  return {
    data,
    total,
  };
};
