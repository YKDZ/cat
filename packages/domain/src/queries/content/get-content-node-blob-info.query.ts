import { blob as blobTable, contentNode, eq, file as fileTable } from "@cat/db";
import type { ServiceImplementationReference } from "@cat/shared";
import * as z from "zod";

import type { Query } from "#/types.ts";

export const GetContentNodeBlobInfoQuerySchema = z.object({
  contentNodeId: z.uuidv4(),
});
export type GetContentNodeBlobInfoQuery = z.infer<
  typeof GetContentNodeBlobInfoQuerySchema
>;

export type ContentNodeBlobInfo = {
  fileId: number | null;
  key: string | null;
  storageProvider: ServiceImplementationReference | null;
  fileName: string | null;
};

/**
 * Get the blob storage info and its stable provider reference for a content node.
 */
export const getContentNodeBlobInfo: Query<
  GetContentNodeBlobInfoQuery,
  ContentNodeBlobInfo | null
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({
      fileId: contentNode.fileId,
      key: blobTable.key,
      storageProvider: blobTable.storageProvider,
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
    storageProvider: row.storageProvider,
    fileName: row.fileName,
  };
};
