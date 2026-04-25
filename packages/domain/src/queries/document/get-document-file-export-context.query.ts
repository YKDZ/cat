import { document, eq } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const GetDocumentFileExportContextQuerySchema = z.object({
  documentId: z.uuidv4(),
});

export type GetDocumentFileExportContextQuery = z.infer<
  typeof GetDocumentFileExportContextQuerySchema
>;

export type DocumentFileExportContext = {
  fileHandlerId: number | null;
  fileId: number | null;
  projectId: string;
};

export const getDocumentFileExportContext: Query<
  GetDocumentFileExportContextQuery,
  DocumentFileExportContext | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({
        fileHandlerId: document.fileHandlerId,
        fileId: document.fileId,
        projectId: document.projectId,
      })
      .from(document)
      .where(eq(document.id, query.documentId))
      .limit(1),
  );
};
