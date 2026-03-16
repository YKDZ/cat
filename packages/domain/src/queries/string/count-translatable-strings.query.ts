import { count, translatableString } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const CountTranslatableStringsQuerySchema = z.object({});

export type CountTranslatableStringsQuery = z.infer<
  typeof CountTranslatableStringsQuerySchema
>;

export const countTranslatableStrings: Query<
  CountTranslatableStringsQuery,
  number
> = async (ctx, _query) => {
  const rows = assertSingleNonNullish(
    await ctx.db.select({ count: count() }).from(translatableString),
  );
  return rows.count;
};
