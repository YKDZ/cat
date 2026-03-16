import { agentRun, eq } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetAgentRunInternalIdQuerySchema = z.object({
  externalId: z.string(),
});

export type GetAgentRunInternalIdQuery = z.infer<
  typeof GetAgentRunInternalIdQuerySchema
>;

export const getAgentRunInternalId: Query<
  GetAgentRunInternalIdQuery,
  number | null
> = async (ctx, query) => {
  const [row] = await ctx.db
    .select({ id: agentRun.id })
    .from(agentRun)
    .where(eq(agentRun.externalId, query.externalId))
    .limit(1);
  return row?.id ?? null;
};
