import {
  agentDefinition,
  agentSession,
  and,
  desc,
  eq,
  getColumns,
} from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListAgentSessionsQuerySchema = z.object({
  userId: z.uuidv4(),
  agentDefinitionId: z.uuidv4().optional(),
  projectId: z.uuidv4().optional(),
  limit: z.int().min(1).max(100).default(20),
  offset: z.int().min(0).default(0),
});

export type ListAgentSessionsQuery = z.infer<
  typeof ListAgentSessionsQuerySchema
>;

export const listAgentSessions: Query<
  ListAgentSessionsQuery,
  Array<typeof agentSession.$inferSelect>
> = async (ctx, query) => {
  const conditions = [eq(agentSession.userId, query.userId)];

  if (query.agentDefinitionId) {
    conditions.push(eq(agentDefinition.externalId, query.agentDefinitionId));
  }

  if (query.projectId) {
    conditions.push(eq(agentSession.projectId, query.projectId));
  }

  return ctx.db
    .select({
      ...getColumns(agentSession),
    })
    .from(agentSession)
    .innerJoin(
      agentDefinition,
      eq(agentSession.agentDefinitionId, agentDefinition.id),
    )
    .where(and(...conditions))
    .orderBy(desc(agentSession.createdAt))
    .limit(query.limit)
    .offset(query.offset);
};
