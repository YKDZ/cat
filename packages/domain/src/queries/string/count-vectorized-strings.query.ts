import { count, vectorizedString } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const CountVectorizedStringsQuerySchema = z.object({});

export type CountVectorizedStringsQuery = z.infer<
  typeof CountVectorizedStringsQuerySchema
>;

export const countVectorizedStrings: Query<
  CountVectorizedStringsQuery,
  number
> = async (ctx, _query) => {
  const rows = assertSingleNonNullish(
    await ctx.db.select({ count: count() }).from(vectorizedString),
  );
  return rows.count;
};
