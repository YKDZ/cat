import type { Glossary } from "@cat/shared";

import { listGlossariesByCreator } from "@cat/domain";

import { runAppQuery } from "@/server/domain";
import { requireTelefuncAuth } from "@/server/telefunc-auth";

export type PagedResult<T> = {
  data: T[];
  total: number;
};

export type GlossaryListItem = Pick<
  Glossary,
  "id" | "name" | "description" | "createdAt" | "updatedAt"
>;

export const onRequestGlossaries = async (
  pageIndex: number,
  pageSize: number,
): Promise<PagedResult<GlossaryListItem>> => {
  const { auth } = requireTelefuncAuth();
  const { data, total } = await runAppQuery(listGlossariesByCreator, {
    creatorId: auth.subjectId,
    pageIndex,
    pageSize,
  });

  return {
    data,
    total,
  };
};
