import { agentRun, agentSession, and, desc, eq, getColumns } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListProjectRunsQuerySchema = z.object({
  projectId: z.uuidv4(),
  status: z
    .enum(["pending", "running", "paused", "completed", "failed", "cancelled"])
    .optional(),
  limit: z.int().min(1).max(100).default(20),
  offset: z.int().nonnegative().default(0),
});

export type ListProjectRunsQuery = z.infer<typeof ListProjectRunsQuerySchema>;

export type ProjectRunRow = typeof agentRun.$inferSelect & {
  sessionExternalId: string;
};

export const listProjectRuns: Query<
  ListProjectRunsQuery,
  ProjectRunRow[]
> = async (ctx, query) => {
  const conditions = [eq(agentSession.projectId, query.projectId)];

  if (query.status) {
    conditions.push(eq(agentRun.status, query.status));
  }

  const rows = await ctx.db
    .select({
      ...getColumns(agentRun),
      sessionExternalId: agentSession.externalId,
    })
    .from(agentRun)
    .innerJoin(agentSession, eq(agentRun.sessionId, agentSession.id))
    .where(and(...conditions))
    .orderBy(desc(agentRun.startedAt))
    .limit(query.limit)
    .offset(query.offset);

  return rows;
};
