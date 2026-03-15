import { and, blob as blobTable, eq, file as fileTable } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetActiveFileBlobInfoQuerySchema = z.object({
  fileId: z.int(),
});

export type GetActiveFileBlobInfoQuery = z.infer<
  typeof GetActiveFileBlobInfoQuerySchema
>;

export type ActiveFileBlobInfo = {
  name: string;
  key: string;
  storageProviderId: number;
};

export const getActiveFileBlobInfo: Query<
  GetActiveFileBlobInfoQuery,
  ActiveFileBlobInfo | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({
        name: fileTable.name,
        key: blobTable.key,
        storageProviderId: blobTable.storageProviderId,
      })
      .from(fileTable)
      .innerJoin(blobTable, eq(blobTable.id, fileTable.blobId))
      .where(and(eq(fileTable.id, query.fileId), eq(fileTable.isActive, true)))
      .limit(1),
  );
};
