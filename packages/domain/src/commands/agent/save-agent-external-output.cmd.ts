import type { NonNullJSONType } from "@cat/shared/schema/json";

import { agentExternalOutput } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const SaveAgentExternalOutputCommandSchema = z.object({
  runInternalId: z.int(),
  nodeId: z.string(),
  outputType: z.string(),
  outputKey: z.string(),
  payload: z.unknown(),
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
      // oxlint-disable-next-line no-unsafe-type-assertion
      payload: (command.payload ?? {}) as NonNullJSONType,
      idempotencyKey: command.idempotencyKey,
      createdAt: command.createdAt,
    })
    .onConflictDoNothing();

  return { result: undefined, events: [] };
};
