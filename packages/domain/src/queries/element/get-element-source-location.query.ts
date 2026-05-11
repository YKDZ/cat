import type { JSONType } from "@cat/shared";

import {
  blob,
  contentNode,
  contentRelation,
  eq,
  file,
  sql,
  translatableElement,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const GetElementSourceLocationQuerySchema = z.object({
  elementId: z.int(),
});
export type GetElementSourceLocationQuery = z.infer<
  typeof GetElementSourceLocationQuerySchema
>;

export type ElementSourceLocation = {
  fileName: string | null;
  blobId: number | null;
  blobKey: string | null;
  storageProviderId: number | null;
  sourceStartLine: number | null;
  sourceEndLine: number | null;
  sourceLocationMeta: JSONType | null;
  fileHandlerId: number | null;
};

/**
 * @zh 获取元素的源文件位置信息（用于编辑器跳转到源文件）。
 * @en Get the source file location info for an element (for editor source navigation).
 */
export const getElementSourceLocation: Query<
  GetElementSourceLocationQuery,
  ElementSourceLocation
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({
      sourceStartLine: translatableElement.sourceStartLine,
      sourceEndLine: translatableElement.sourceEndLine,
      sourceLocationMeta: translatableElement.sourceLocationMeta,
      fileName: file.name,
      blobId: blob.id,
      blobKey: blob.key,
      storageProviderId: blob.storageProviderId,
      fileHandlerId: contentNode.fileHandlerId,
    })
    .from(translatableElement)
    .leftJoin(
      contentRelation,
      sql`${contentRelation.targetElementId} = ${translatableElement.id}
        AND ${contentRelation.isPrimary} = true
        AND ${contentRelation.targetEndpointKind} = 'ELEMENT'`,
    )
    .leftJoin(contentNode, eq(contentRelation.sourceNodeId, contentNode.id))
    .leftJoin(file, eq(contentNode.fileId, file.id))
    .leftJoin(blob, eq(file.blobId, blob.id))
    .where(eq(translatableElement.id, query.elementId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return {
      fileName: null,
      blobId: null,
      blobKey: null,
      storageProviderId: null,
      sourceStartLine: null,
      sourceEndLine: null,
      sourceLocationMeta: null,
      fileHandlerId: null,
    };
  }

  return {
    fileName: row.fileName ?? null,
    blobId: row.blobId ?? null,
    blobKey: row.blobKey ?? null,
    storageProviderId: row.storageProviderId ?? null,
    sourceStartLine: row.sourceStartLine ?? null,
    sourceEndLine: row.sourceEndLine ?? null,
    sourceLocationMeta: row.sourceLocationMeta ?? null,
    fileHandlerId: row.fileHandlerId ?? null,
  };
};
