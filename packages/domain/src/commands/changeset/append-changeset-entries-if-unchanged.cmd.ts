import {
  changeset,
  changesetEntry,
  desc,
  entityBranch,
  eq,
  getColumns,
} from "@cat/db";
import {
  ChangeActionSchema,
  EntityTypeSchema,
  RiskLevelSchema,
  safeZDotJson,
} from "@cat/shared";
import * as z from "zod";

import { inDatabaseTransaction } from "#/infrastructure/db-transaction.ts";
import type { Command } from "#/types.ts";

const EntrySchema = z.strictObject({
  entityType: EntityTypeSchema,
  entityId: z.string(),
  action: ChangeActionSchema,
  before: safeZDotJson.nullable(),
  after: safeZDotJson.nullable(),
  fieldPath: z.string().nullable(),
  riskLevel: RiskLevelSchema,
});

export const AppendChangesetEntriesIfUnchangedCommandSchema = z.strictObject({
  changesetId: z.int().positive(),
  expectedLatestEntryId: z.int().positive().nullable(),
  entries: z.array(EntrySchema),
});

export type AppendChangesetEntriesIfUnchangedResult =
  | { status: "APPENDED"; latestEntryId: number | null }
  | { status: "CONFLICT"; latestEntryId: number | null }
  | { status: "BRANCH_NOT_ACTIVE"; latestEntryId: number | null };

export const appendChangesetEntriesIfUnchanged: Command<
  z.infer<typeof AppendChangesetEntriesIfUnchangedCommandSchema>,
  AppendChangesetEntriesIfUnchangedResult
> = async (ctx, input) => {
  const command = AppendChangesetEntriesIfUnchangedCommandSchema.parse(input);
  const result = await inDatabaseTransaction(ctx.db, async (tx) => {
    const [candidateChangeset] = await tx
      .select({ id: changeset.id, branchId: changeset.branchId })
      .from(changeset)
      .where(eq(changeset.id, command.changesetId))
      .limit(1);
    if (!candidateChangeset) {
      throw new Error(`Changeset ${command.changesetId} does not exist.`);
    }
    if (candidateChangeset.branchId === null) {
      throw new Error(`Changeset ${command.changesetId} is not branch-scoped.`);
    }
    const [lockedBranch] = await tx
      .select({ status: entityBranch.status })
      .from(entityBranch)
      .where(eq(entityBranch.id, candidateChangeset.branchId))
      .limit(1)
      .for("update");
    if (!lockedBranch || lockedBranch.status !== "ACTIVE") {
      const [latest] = await tx
        .select({ id: changesetEntry.id })
        .from(changesetEntry)
        .where(eq(changesetEntry.changesetId, command.changesetId))
        .orderBy(desc(changesetEntry.id))
        .limit(1);
      return {
        status: "BRANCH_NOT_ACTIVE" as const,
        latestEntryId: latest?.id ?? null,
      };
    }
    const [lockedChangeset] = await tx
      .select({ id: changeset.id, branchId: changeset.branchId })
      .from(changeset)
      .where(eq(changeset.id, command.changesetId))
      .limit(1)
      .for("update");
    if (lockedChangeset?.branchId !== candidateChangeset.branchId) {
      throw new Error(
        `Changeset ${command.changesetId} changed branch ownership.`,
      );
    }
    const [latest] = await tx
      .select({ id: changesetEntry.id })
      .from(changesetEntry)
      .where(eq(changesetEntry.changesetId, command.changesetId))
      .orderBy(desc(changesetEntry.id))
      .limit(1);
    const latestEntryId = latest?.id ?? null;
    if (latestEntryId !== command.expectedLatestEntryId) {
      return { status: "CONFLICT" as const, latestEntryId };
    }
    if (command.entries.length === 0) {
      return { status: "APPENDED" as const, latestEntryId };
    }
    const inserted = [] as Array<typeof changesetEntry.$inferSelect>;
    for (const entry of command.entries) {
      const [row] = await tx
        .insert(changesetEntry)
        .values({
          changesetId: command.changesetId,
          entityType: entry.entityType,
          entityId: entry.entityId,
          action: entry.action,
          before: entry.before,
          after: entry.after,
          fieldPath: entry.fieldPath,
          riskLevel: entry.riskLevel,
          reviewStatus: "PENDING",
        })
        .returning(getColumns(changesetEntry));
      if (!row)
        throw new Error("Changeset entry insertion did not return a row.");
      inserted.push(row);
    }
    return {
      status: "APPENDED" as const,
      latestEntryId: inserted.at(-1)?.id ?? latestEntryId,
    };
  });
  return { result, events: [] };
};
