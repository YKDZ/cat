import { agentDefinition, and, eq, getColumns } from "@cat/db";
import { ScopeTypeSchema } from "@cat/shared";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const FindAgentDefinitionByDefinitionIdAndScopeQuerySchema = z.object({
  definitionId: z.string().min(1),
  scopeType: ScopeTypeSchema,
  scopeId: z.string(),
});

export type FindAgentDefinitionByDefinitionIdAndScopeQuery = z.infer<
  typeof FindAgentDefinitionByDefinitionIdAndScopeQuerySchema
>;

export const findAgentDefinitionByDefinitionIdAndScope: Query<
  FindAgentDefinitionByDefinitionIdAndScopeQuery,
  typeof agentDefinition.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({
        ...getColumns(agentDefinition),
      })
      .from(agentDefinition)
      .where(
        and(
          eq(agentDefinition.definitionId, query.definitionId),
          eq(agentDefinition.scopeType, query.scopeType),
          eq(agentDefinition.scopeId, query.scopeId),
        ),
      )
      .limit(1),
  );
};
