import { agentDefinition, and, desc, eq, getColumns } from "@cat/db";
import {
  AgentDefinitionTypeSchema,
  ScopeTypeSchema,
} from "@cat/shared/schema/drizzle/enum";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListAgentDefinitionsQuerySchema = z.object({
  scopeType: ScopeTypeSchema.optional(),
  scopeId: z.string().optional(),
  type: AgentDefinitionTypeSchema.optional(),
});

export type ListAgentDefinitionsQuery = z.infer<
  typeof ListAgentDefinitionsQuerySchema
>;

export const listAgentDefinitions: Query<
  ListAgentDefinitionsQuery,
  Array<typeof agentDefinition.$inferSelect>
> = async (ctx, query) => {
  const conditions = [];

  if (query.scopeType) {
    conditions.push(eq(agentDefinition.scopeType, query.scopeType));
  }

  if (query.scopeId) {
    conditions.push(eq(agentDefinition.scopeId, query.scopeId));
  }

  if (query.type) {
    conditions.push(eq(agentDefinition.type, query.type));
  }

  return ctx.db
    .select({
      ...getColumns(agentDefinition),
    })
    .from(agentDefinition)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(agentDefinition.createdAt));
};
