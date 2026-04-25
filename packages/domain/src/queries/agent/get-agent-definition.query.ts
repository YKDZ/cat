import { agentDefinition, eq, getColumns } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const GetAgentDefinitionQuerySchema = z.object({
  id: z.uuidv4(),
});

export type GetAgentDefinitionQuery = z.infer<
  typeof GetAgentDefinitionQuerySchema
>;

export const getAgentDefinition: Query<
  GetAgentDefinitionQuery,
  typeof agentDefinition.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({
        ...getColumns(agentDefinition),
      })
      .from(agentDefinition)
      .where(eq(agentDefinition.externalId, query.id))
      .limit(1),
  );
};
