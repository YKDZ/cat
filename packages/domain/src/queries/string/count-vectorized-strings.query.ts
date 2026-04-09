import { count, vectorizedString } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

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
