import { and, blob as blobTable, eq, file as fileTable } from "@cat/db";
import {
  assertSingleOrNull,
  type ServiceImplementationReference,
} from "@cat/shared";
import * as z from "zod";

import type { Query } from "#/types.ts";

export const GetActiveFileBlobInfoQuerySchema = z.object({
  fileId: z.int(),
});

export type GetActiveFileBlobInfoQuery = z.infer<
  typeof GetActiveFileBlobInfoQuerySchema
>;

export type ActiveFileBlobInfo = {
  name: string;
  key: string;
  storageProvider: ServiceImplementationReference;
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
        storageProvider: blobTable.storageProvider,
      })
      .from(fileTable)
      .innerJoin(blobTable, eq(blobTable.id, fileTable.blobId))
      .where(and(eq(fileTable.id, query.fileId), eq(fileTable.isActive, true)))
      .limit(1),
  );
};
