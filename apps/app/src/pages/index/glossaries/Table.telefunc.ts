import {
  GlossaryListSortSchema,
  listGlossariesByCreator,
  type GlossaryListSort,
} from "@cat/domain";
import type { Glossary } from "@cat/shared";
import * as z from "zod";

import { runAppQuery } from "#/server/domain.ts";
import { requireTelefuncAuth } from "#/server/telefunc-auth.ts";

export type PagedResult<T> = {
  data: T[];
  total: number;
};

export type GlossaryListItem = Pick<
  Glossary,
  "id" | "name" | "description" | "createdAt" | "updatedAt"
>;

const GlossaryListRequestSchema = z.strictObject({
  pageIndex: z.int().min(0),
  pageSize: z.int().min(1).max(100),
  search: z.string().trim().min(1).nullish(),
  sort: GlossaryListSortSchema.optional(),
});

export const onRequestGlossaries = async (
  pageIndex: number,
  pageSize: number,
  search?: string | null,
  sort?: GlossaryListSort,
): Promise<PagedResult<GlossaryListItem>> => {
  const request = GlossaryListRequestSchema.parse({
    pageIndex,
    pageSize,
    search,
    sort,
  });
  const { auth } = requireTelefuncAuth();
  const { data, total } = await runAppQuery(listGlossariesByCreator, {
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
