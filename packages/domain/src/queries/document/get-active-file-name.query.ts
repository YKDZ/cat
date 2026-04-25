import { and, eq, file } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const GetActiveFileNameQuerySchema = z.object({
  fileId: z.int(),
});

export type GetActiveFileNameQuery = z.infer<
  typeof GetActiveFileNameQuerySchema
>;

export const getActiveFileName: Query<
  GetActiveFileNameQuery,
  string | null
> = async (ctx, query) => {
  const row = assertSingleOrNull(
    await ctx.db
      .select({ fileName: file.name })
      .from(file)
      .where(and(eq(file.id, query.fileId), eq(file.isActive, true)))
      .limit(1),
  );

  return row?.fileName ?? null;
};
