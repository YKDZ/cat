import { and, contentNode, eq } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const FindProjectContentNodeByLabelQuerySchema = z.object({
  projectId: z.uuidv4(),
  displayLabel: z.string(),
  kind: z
    .enum([
      "DIRECTORY",
      "FILE",
      "MARKDOWN_SECTION",
      "SOURCE_COMPONENT",
      "CUSTOM",
    ])
    .optional(),
});
export type FindProjectContentNodeByLabelQuery = z.infer<
  typeof FindProjectContentNodeByLabelQuerySchema
>;

/**
 * Find a content node in a project by displayLabel (optionally filtered by kind).
 */
export const findProjectContentNodeByLabel: Query<
  FindProjectContentNodeByLabelQuery,
  typeof contentNode.$inferSelect | null
> = async (ctx, query) => {
  const conditions = [
    eq(contentNode.projectId, query.projectId),
    eq(contentNode.displayLabel, query.displayLabel),
  ];

  if (query.kind) {
    conditions.push(eq(contentNode.kind, query.kind));
  }

  const rows = await ctx.db
    .select()
    .from(contentNode)
    .where(and(...conditions))
    .limit(1);

  return rows[0] ?? null;
};
