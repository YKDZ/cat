import {
  blob,
  contentNode,
  contentRelation,
  eq,
  file,
  sql,
  translatableElement,
} from "@cat/db";
import type { JSONType, ServiceImplementationReference } from "@cat/shared";
import * as z from "zod";

import type { Query } from "#/types.ts";

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
  storageProvider: ServiceImplementationReference | null;
  sourceStartLine: number | null;
  sourceEndLine: number | null;
  sourceLocationMeta: JSONType | null;
  fileHandler: ServiceImplementationReference | null;
};

/**
 * Get the source file location info for an element (for editor source navigation).
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
      storageProvider: blob.storageProvider,
      fileHandler: contentNode.fileHandler,
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
      storageProvider: null,
      sourceStartLine: null,
      sourceEndLine: null,
      sourceLocationMeta: null,
      fileHandler: null,
    };
  }

  return {
    fileName: row.fileName ?? null,
    blobId: row.blobId ?? null,
    blobKey: row.blobKey ?? null,
    storageProvider: row.storageProvider ?? null,
    sourceStartLine: row.sourceStartLine ?? null,
    sourceEndLine: row.sourceEndLine ?? null,
    sourceLocationMeta: row.sourceLocationMeta ?? null,
    fileHandler: row.fileHandler ?? null,
  };
};
