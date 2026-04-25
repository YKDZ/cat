import { and, document, eq } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const FindProjectDocumentByNameQuerySchema = z.object({
  projectId: z.uuidv4(),
  name: z.string().min(1),
  isDirectory: z.boolean().default(false),
});

export type FindProjectDocumentByNameQuery = z.infer<
  typeof FindProjectDocumentByNameQuerySchema
>;

export const findProjectDocumentByName: Query<
  FindProjectDocumentByNameQuery,
  { id: string } | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({ id: document.id })
      .from(document)
      .where(
        and(
          eq(document.projectId, query.projectId),
          eq(document.name, query.name),
          eq(document.isDirectory, query.isDirectory),
        ),
      )
      .limit(1),
  );
};
