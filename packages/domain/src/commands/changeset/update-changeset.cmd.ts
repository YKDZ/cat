import { changeset, changesetEntry, eq } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

export const ReviewChangesetEntryCommandSchema = z.object({
  entryId: z.int(),
  verdict: z.enum(["APPROVED", "REJECTED"]),
});

export type ReviewChangesetEntryCommand = z.infer<
  typeof ReviewChangesetEntryCommandSchema
>;

export const reviewChangesetEntry: Command<
  ReviewChangesetEntryCommand
> = async (ctx, command) => {
  await ctx.db
    .update(changesetEntry)
    .set({ reviewStatus: command.verdict })
    .where(eq(changesetEntry.id, command.entryId));
  return { result: undefined, events: [] };
};

// ─── Review full changeset ───────────────────────────────────────────────────

export const ReviewChangesetCommandSchema = z.object({
  changesetId: z.int(),
  verdict: z.enum(["APPROVED", "REJECTED"]),
  reviewedBy: z.uuid().optional(),
});

export type ReviewChangesetCommand = z.infer<
  typeof ReviewChangesetCommandSchema
>;

export const reviewChangeset: Command<ReviewChangesetCommand> = async (
  ctx,
  command,
) => {
  const now = new Date();
  // Map verdict to changeset status
  const status =
    command.verdict === "APPROVED" ? "APPROVED" : ("REJECTED" as const);

  await ctx.db
    .update(changeset)
    .set({
      status,
      reviewedBy: command.reviewedBy,
      reviewedAt: now,
    })
    .where(eq(changeset.id, command.changesetId));

  return { result: undefined, events: [] };
};

// ─── Apply changeset ─────────────────────────────────────────────────────────

export const ApplyChangesetCommandSchema = z.object({
  changesetId: z.int(),
});

export type ApplyChangesetCommand = z.infer<typeof ApplyChangesetCommandSchema>;

export const applyChangeset: Command<ApplyChangesetCommand> = async (
  ctx,
  command,
) => {
  const now = new Date();
  await ctx.db
    .update(changeset)
    .set({ status: "APPLIED", appliedAt: now })
    .where(eq(changeset.id, command.changesetId));
  return { result: undefined, events: [] };
};

// ─── Update entry async status ───────────────────────────────────────────────

export const UpdateEntryAsyncStatusCommandSchema = z.object({
  entryId: z.int(),
  asyncStatus: z.enum(["READY", "PENDING", "FAILED"]),
});

export type UpdateEntryAsyncStatusCommand = z.infer<
  typeof UpdateEntryAsyncStatusCommandSchema
>;

export const updateEntryAsyncStatus: Command<
  UpdateEntryAsyncStatusCommand
> = async (ctx, command) => {
  await ctx.db
    .update(changesetEntry)
    .set({ asyncStatus: command.asyncStatus })
    .where(eq(changesetEntry.id, command.entryId));
  return { result: undefined, events: [] };
};

// ─── Update changeset async status ──────────────────────────────────────────

export const UpdateChangesetAsyncStatusCommandSchema = z.object({
  changesetId: z.int(),
  asyncStatus: z.enum(["ALL_READY", "HAS_PENDING", "HAS_FAILED"]).nullable(),
});

export type UpdateChangesetAsyncStatusCommand = z.infer<
  typeof UpdateChangesetAsyncStatusCommandSchema
>;

export const updateChangesetAsyncStatus: Command<
  UpdateChangesetAsyncStatusCommand
> = async (ctx, command) => {
  await ctx.db
    .update(changeset)
    .set({ asyncStatus: command.asyncStatus })
    .where(eq(changeset.id, command.changesetId));
  return { result: undefined, events: [] };
};
