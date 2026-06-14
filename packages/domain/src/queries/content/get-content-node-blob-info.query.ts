import { blob as blobTable, contentNode, eq, file as fileTable } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const GetContentNodeBlobInfoQuerySchema = z.object({
  contentNodeId: z.uuidv4(),
});
export type GetContentNodeBlobInfoQuery = z.infer<
  typeof GetContentNodeBlobInfoQuerySchema
>;

export type ContentNodeBlobInfo = {
  fileId: number | null;
  key: string | null;
  storageProviderId: number | null;
  fileName: string | null;
};

/**
 * Get the blob storage info (key, storageProviderId, fileName) for the content node's file.
 */
export const getContentNodeBlobInfo: Query<
  GetContentNodeBlobInfoQuery,
  ContentNodeBlobInfo | null
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({
      fileId: contentNode.fileId,
      key: blobTable.key,
      storageProviderId: blobTable.storageProviderId,
      fileName: fileTable.name,
    })
    .from(contentNode)
    .leftJoin(fileTable, eq(fileTable.id, contentNode.fileId))
    .leftJoin(blobTable, eq(blobTable.id, fileTable.blobId))
    .where(eq(contentNode.id, query.contentNodeId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    fileId: row.fileId,
    key: row.key,
    storageProviderId: row.storageProviderId,
    fileName: row.fileName,
  };
};
