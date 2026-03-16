import { blob } from "@cat/db";
import { eq } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetBlobByKeyQuerySchema = z.object({
  key: z.string(),
});

export type GetBlobByKeyQuery = z.infer<typeof GetBlobByKeyQuerySchema>;

export const getBlobByKey: Query<
  GetBlobByKeyQuery,
  typeof blob.$inferSelect | null
> = async (ctx, query) => {
  const rows = await ctx.db
    .select()
    .from(blob)
    .where(eq(blob.key, query.key))
    .limit(1);

  return rows[0] ?? null;
};
