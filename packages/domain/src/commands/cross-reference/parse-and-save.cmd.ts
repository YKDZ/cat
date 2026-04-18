import { and, crossReference, eq, issue, pullRequest, sql } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

export const ParseAndSaveCrossReferencesCommandSchema = z.object({
  projectId: z.uuid(),
  sourceType: z.enum(["issue", "pr", "issue_comment"]),
  sourceId: z.int().positive(),
  text: z.string(),
});

export type ParseAndSaveCrossReferencesCommand = z.infer<
  typeof ParseAndSaveCrossReferencesCommandSchema
>;

function extractHashReferences(text: string): number[] {
  const matches = text.matchAll(/#(\d+)/g);
  return [...new Set([...matches].map((m) => parseInt(m[1], 10)))];
}

/**
 * Parses #N references in text and saves them to the cross_reference table.
 * On edit: deletes old references for this source, then inserts fresh ones.
 */
export const parseAndSaveCrossReferences: Command<
  ParseAndSaveCrossReferencesCommand
> = async (ctx, command) => {
  await ctx.db
    .delete(crossReference)
    .where(
      and(
        eq(crossReference.sourceType, command.sourceType),
        eq(crossReference.sourceId, command.sourceId),
      ),
    );

  const nums = extractHashReferences(command.text);
  if (nums.length === 0) return { result: undefined, events: [] };

  const issueRows = await ctx.db
    .select({ id: issue.id, number: issue.number })
    .from(issue)
    .where(
      and(
        eq(issue.projectId, command.projectId),
        sql`${issue.number} = ANY(${sql.raw(`ARRAY[${nums.join(",")}]`)}::int[])`,
      ),
    );

  const prRows = await ctx.db
    .select({ id: pullRequest.id, number: pullRequest.number })
    .from(pullRequest)
    .where(
      and(
        eq(pullRequest.projectId, command.projectId),
        sql`${pullRequest.number} = ANY(${sql.raw(`ARRAY[${nums.join(",")}]`)}::int[])`,
      ),
    );

  const entries: (typeof crossReference.$inferInsert)[] = [];
  for (const row of issueRows) {
    entries.push({
      projectId: command.projectId,
      sourceType: command.sourceType,
      sourceId: command.sourceId,
      targetType: "issue",
      targetId: row.id,
    });
  }
  for (const row of prRows) {
    entries.push({
      projectId: command.projectId,
      sourceType: command.sourceType,
      sourceId: command.sourceId,
      targetType: "pr",
      targetId: row.id,
    });
  }

  if (entries.length > 0) {
    await ctx.db.insert(crossReference).values(entries).onConflictDoNothing();
  }

  return { result: undefined, events: [] };
};
