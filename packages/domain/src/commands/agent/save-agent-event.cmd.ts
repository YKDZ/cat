import { agentEvent, agentRun, and, eq, isNull, sql } from "@cat/db";
import { nonNullSafeZDotJson } from "@cat/shared";
import * as z from "zod";

import type { Command } from "#/types.ts";

export const SaveAgentEventCommandSchema = z
  .object({
    runInternalId: z.int(),
    eventId: z.string(),
    parentEventId: z.string().nullable(),
    nodeId: z.string().nullable(),
    type: z.string(),
    payload: nonNullSafeZDotJson,
    timestamp: z.date(),
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

export type SaveAgentEventCommand = z.infer<typeof SaveAgentEventCommandSchema>;

export const saveAgentEvent: Command<SaveAgentEventCommand, number> = async (
  ctx,
  command,
) => {
  if ((command.ownerId === undefined) !== (command.ownerEpoch === undefined)) {
    throw new Error(
      "Agent run ownership requires both ownerId and ownerEpoch.",
    );
  }
  const sequence = await ctx.db.transaction(async (tx) => {
    if (command.ownerId !== undefined && command.ownerEpoch !== undefined) {
      const [owner] = await tx
        .select({ id: agentRun.id, status: agentRun.status })
        .from(agentRun)
        .where(
          and(
            eq(agentRun.id, command.runInternalId),
            eq(agentRun.ownerId, command.ownerId),
            eq(agentRun.ownerEpoch, command.ownerEpoch),
            sql`${agentRun.ownerLeaseExpiresAt} > clock_timestamp()`,
          ),
        )
        .for("update");
      if (!owner) throw new Error("Workflow owner lease lost.");
      const payloadStatus =
        typeof command.payload === "object" &&
        command.payload !== null &&
        !Array.isArray(command.payload)
          ? Reflect.get(command.payload, "status")
          : undefined;
      const isMatchingTerminalEvent =
        command.type === "run:end" &&
        command.nodeId === null &&
        (owner.status === "completed" ||
          owner.status === "failed" ||
          owner.status === "cancelled") &&
        payloadStatus === owner.status;
      if (
        owner.status !== "running" &&
        owner.status !== "paused" &&
        !isMatchingTerminalEvent
      ) {
        throw new Error("Workflow owner lease lost.");
      }
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
    const [inserted] = await tx
      .insert(agentEvent)
      .values({
        runId: command.runInternalId,
        eventId: command.eventId,
        parentEventId: command.parentEventId,
        nodeId: command.nodeId,
        type: command.type,
        payload: command.payload ?? {},
        timestamp: command.timestamp,
      })
      .onConflictDoNothing()
      .returning({ sequence: agentEvent.id });
    if (inserted) return inserted.sequence;
    const [existing] = await tx
      .select({ sequence: agentEvent.id })
      .from(agentEvent)
      .where(
        and(
          eq(agentEvent.runId, command.runInternalId),
          eq(agentEvent.eventId, command.eventId),
        ),
      );
    if (!existing) throw new Error("Persisted event identity was not found.");
    return existing.sequence;
  });

  return { result: sequence, events: [] };
};
