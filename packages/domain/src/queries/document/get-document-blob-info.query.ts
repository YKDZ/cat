import {
  and,
  blob as blobTable,
  document as documentTable,
  eq,
  file as fileTable,
} from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

export const GetDocumentBlobInfoQuerySchema = z.object({
  documentId: z.uuidv4(),
});

export type GetDocumentBlobInfoQuery = z.infer<
  typeof GetDocumentBlobInfoQuerySchema
>;

export type DocumentBlobInfo = {
  key: string | null;
  storageProviderId: number | null;
  fileName: string | null;
};

export const getDocumentBlobInfo: Query<
  GetDocumentBlobInfoQuery,
  DocumentBlobInfo | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({
        key: blobTable.key,
        storageProviderId: blobTable.storageProviderId,
        fileName: fileTable.name,
      })
      .from(documentTable)
      .leftJoin(
        fileTable,
        and(
          eq(fileTable.id, documentTable.fileId),
          eq(fileTable.isActive, true),
        ),
      )
      .leftJoin(blobTable, eq(blobTable.id, fileTable.blobId))
      .where(eq(documentTable.id, query.documentId))
      .limit(1),
  );
};
