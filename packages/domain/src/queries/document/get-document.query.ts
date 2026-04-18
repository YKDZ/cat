import { document, eq } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

export const GetDocumentQuerySchema = z.object({
  documentId: z.uuidv4(),
});

export type GetDocumentQuery = z.infer<typeof GetDocumentQuerySchema>;

export const getDocument: Query<
  GetDocumentQuery,
  typeof document.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select()
      .from(document)
      .where(eq(document.id, query.documentId)),
  );
};
