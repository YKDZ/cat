import {
  agentExternalOutput,
  agentRun,
  and,
  eq,
  isNull,
  or,
  sql,
} from "@cat/db";
import { nonNullSafeZDotJson } from "@cat/shared";
import * as z from "zod";

import type { Command } from "#/types.ts";

export const SaveAgentExternalOutputCommandSchema = z
  .object({
    runInternalId: z.int(),
    nodeId: z.string(),
    outputType: z.string(),
    outputKey: z.string(),
    payload: nonNullSafeZDotJson,
    idempotencyKey: z.string().nullable(),
    createdAt: z.date(),
    ownerId: z.uuidv4().optional(),
    ownerEpoch: z.int().positive().optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.ownerId === undefined) !== (value.ownerEpoch === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["ownerId"],
        message: "Agent run ownership requires both ownerId and ownerEpoch.",
      });
    }
  });

export type SaveAgentExternalOutputCommand = z.infer<
  typeof SaveAgentExternalOutputCommandSchema
>;

export const saveAgentExternalOutput: Command<
  SaveAgentExternalOutputCommand
> = async (ctx, command) => {
  if ((command.ownerId === undefined) !== (command.ownerEpoch === undefined)) {
    throw new Error(
      "Agent run ownership requires both ownerId and ownerEpoch.",
    );
  }
  await ctx.db.transaction(async (tx) => {
    if (command.ownerId !== undefined && command.ownerEpoch !== undefined) {
      const [owner] = await tx
        .select({ id: agentRun.id })
        .from(agentRun)
        .where(
          and(
            eq(agentRun.id, command.runInternalId),
            eq(agentRun.ownerId, command.ownerId),
            eq(agentRun.ownerEpoch, command.ownerEpoch),
            or(eq(agentRun.status, "running"), eq(agentRun.status, "paused")),
            sql`${agentRun.ownerLeaseExpiresAt} > clock_timestamp()`,
          ),
        )
        .for("update");
      if (!owner) throw new Error("Workflow owner lease lost.");
    } else {
      const [unowned] = await tx
        .select({ id: agentRun.id })
        .from(agentRun)
        .where(
          and(eq(agentRun.id, command.runInternalId), isNull(agentRun.ownerId)),
        )
        .for("update");
      if (!unowned) throw new Error("Workflow owner lease lost.");
    }
    await tx
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
  });

  return { result: undefined, events: [] };
};
