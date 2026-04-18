import { file } from "@cat/db";
import { eq } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

export const GetFileQuerySchema = z.object({
  fileId: z.int(),
});

export type GetFileQuery = z.infer<typeof GetFileQuerySchema>;

export const getFile: Query<
  GetFileQuery,
  typeof file.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db.select().from(file).where(eq(file.id, query.fileId)).limit(1),
  );
};
