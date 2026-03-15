import {
  and,
  blob as blobTable,
  document as documentTable,
  eq,
  file as fileTable,
  translatableElement,
} from "@cat/db";
import { safeZDotJson } from "@cat/shared/schema/json";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetElementSourceLocationQuerySchema = z.object({
  elementId: z.int(),
});

export type GetElementSourceLocationQuery = z.infer<
  typeof GetElementSourceLocationQuerySchema
>;

export const ElementSourceLocationRowSchema = z.object({
  sourceStartLine: z.int().nullable(),
  sourceEndLine: z.int().nullable(),
  sourceLocationMeta: safeZDotJson.nullable(),
  fileHandlerId: z.int().nullable(),
  fileName: z.string().nullable(),
  blobId: z.int().nullable(),
  blobKey: z.string().nullable(),
  storageProviderId: z.int().nullable(),
});

export type ElementSourceLocationRow = z.infer<
  typeof ElementSourceLocationRowSchema
>;

export const getElementSourceLocation: Query<
  GetElementSourceLocationQuery,
  ElementSourceLocationRow
> = async (ctx, query) => {
  return assertSingleNonNullish(
    await ctx.db
      .select({
        sourceStartLine: translatableElement.sourceStartLine,
        sourceEndLine: translatableElement.sourceEndLine,
        sourceLocationMeta: translatableElement.sourceLocationMeta,
        fileHandlerId: documentTable.fileHandlerId,
        fileName: fileTable.name,
        blobId: blobTable.id,
        blobKey: blobTable.key,
        storageProviderId: blobTable.storageProviderId,
      })
      .from(translatableElement)
      .innerJoin(
        documentTable,
        eq(documentTable.id, translatableElement.documentId),
      )
      .leftJoin(
        fileTable,
        and(
          eq(fileTable.id, documentTable.fileId),
          eq(fileTable.isActive, true),
        ),
      )
      .leftJoin(blobTable, eq(blobTable.id, fileTable.blobId))
      .where(eq(translatableElement.id, query.elementId)),
    `Element with ID ${query.elementId} not found`,
  );
};
