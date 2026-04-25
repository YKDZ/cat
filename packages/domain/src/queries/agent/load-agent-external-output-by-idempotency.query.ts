import type { NonNullJSONType } from "@cat/shared";

import { agentExternalOutput, and, eq } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const LoadAgentExternalOutputByIdempotencyQuerySchema = z.object({
  runInternalId: z.int(),
  idempotencyKey: z.string(),
});

export type LoadAgentExternalOutputByIdempotencyQuery = z.infer<
  typeof LoadAgentExternalOutputByIdempotencyQuerySchema
>;

export type AgentExternalOutputRow = {
  nodeId: string;
  outputType: string;
  outputKey: string;
  payload: NonNullJSONType;
  idempotencyKey: string | null;
  createdAt: Date;
};

export const loadAgentExternalOutputByIdempotency: Query<
  LoadAgentExternalOutputByIdempotencyQuery,
  AgentExternalOutputRow | null
> = async (ctx, query) => {
  const [row] = await ctx.db
    .select({
      nodeId: agentExternalOutput.nodeId,
      outputType: agentExternalOutput.outputType,
      outputKey: agentExternalOutput.outputKey,
      payload: agentExternalOutput.payload,
      idempotencyKey: agentExternalOutput.idempotencyKey,
      createdAt: agentExternalOutput.createdAt,
    })
    .from(agentExternalOutput)
    .where(
      and(
        eq(agentExternalOutput.runId, query.runInternalId),
        eq(agentExternalOutput.idempotencyKey, query.idempotencyKey),
      ),
    )
    .limit(1);

  return row ?? null;
};
