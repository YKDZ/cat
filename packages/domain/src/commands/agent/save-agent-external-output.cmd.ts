import { agentExternalOutput } from "@cat/db";
import { nonNullSafeZDotJson } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

export const SaveAgentExternalOutputCommandSchema = z.object({
  runInternalId: z.int(),
  nodeId: z.string(),
  outputType: z.string(),
  outputKey: z.string(),
  payload: nonNullSafeZDotJson,
  idempotencyKey: z.string().nullable(),
  createdAt: z.date(),
});

export type SaveAgentExternalOutputCommand = z.infer<
  typeof SaveAgentExternalOutputCommandSchema
>;

export const saveAgentExternalOutput: Command<
  SaveAgentExternalOutputCommand
> = async (ctx, command) => {
  await ctx.db
    .insert(agentExternalOutput)
    .values({
      runId: command.runInternalId,
      nodeId: command.nodeId,
      outputType: command.outputType,
      outputKey: command.outputKey,
      payload: command.payload ?? {},
      idempotencyKey: command.idempotencyKey,
      createdAt: command.createdAt,
    })
    .onConflictDoNothing();

  return { result: undefined, events: [] };
};
