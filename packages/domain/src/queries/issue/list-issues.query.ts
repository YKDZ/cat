import {
  and,
  asc,
  eq,
  getColumns,
  inArray,
  issue,
  issueLabel,
  sql,
  type SQL,
} from "@cat/db";
import { IssueStatusSchema } from "@cat/shared/schema/enum";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListIssuesQuerySchema = z.object({
  projectId: z.uuid(),
  status: IssueStatusSchema.optional(),
  label: z.string().optional(),
  assigneeId: z.string().optional(),
  limit: z.int().positive().default(50),
  offset: z.int().nonnegative().default(0),
});

export type ListIssuesQuery = z.infer<typeof ListIssuesQuerySchema>;

export const listIssues: Query<
  ListIssuesQuery,
  (typeof issue.$inferSelect)[]
> = async (ctx, query) => {
  const conditions: SQL[] = [eq(issue.projectId, query.projectId)];

  if (query.status) {
    conditions.push(eq(issue.status, query.status));
  }

  if (query.assigneeId) {
    // Use PostgreSQL jsonb @> containment operator to check if assignees array
    // contains an object with the given id
    conditions.push(
      sql`${issue.assignees} @> ${JSON.stringify([{ id: query.assigneeId }])}::jsonb`,
    );
  }

  if (query.label) {
    const rows = await ctx.db
      .selectDistinct({ issueId: issueLabel.issueId })
      .from(issueLabel)
      .where(eq(issueLabel.label, query.label));

    const issueIds = rows.map((r) => r.issueId);
    if (issueIds.length === 0) return [];

    conditions.push(inArray(issue.id, issueIds));
  }

  return ctx.db
    .select({ ...getColumns(issue) })
    .from(issue)
    .where(and(...conditions))
    .orderBy(asc(issue.number))
    .limit(query.limit)
    .offset(query.offset);
};
