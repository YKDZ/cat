import { agentDefinition, and, eq, getColumns } from "@cat/db";
import { ScopeTypeSchema } from "@cat/shared/schema/enum";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

export const FindAgentDefinitionByNameAndScopeQuerySchema = z.object({
  name: z.string().min(1),
  scopeType: ScopeTypeSchema,
  scopeId: z.string(),
  isBuiltin: z.boolean().optional(),
});

export type FindAgentDefinitionByNameAndScopeQuery = z.infer<
  typeof FindAgentDefinitionByNameAndScopeQuerySchema
>;

export const findAgentDefinitionByNameAndScope: Query<
  FindAgentDefinitionByNameAndScopeQuery,
  typeof agentDefinition.$inferSelect | null
> = async (ctx, query) => {
  const conditions = [
    eq(agentDefinition.name, query.name),
    eq(agentDefinition.scopeType, query.scopeType),
    eq(agentDefinition.scopeId, query.scopeId),
  ];

  if (query.isBuiltin !== undefined) {
    conditions.push(eq(agentDefinition.isBuiltin, query.isBuiltin));
  }

  return assertSingleOrNull(
    await ctx.db
      .select({
        ...getColumns(agentDefinition),
      })
      .from(agentDefinition)
      .where(and(...conditions))
      .limit(1),
  );
};
