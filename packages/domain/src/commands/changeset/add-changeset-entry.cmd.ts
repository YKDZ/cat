import { changesetEntry, getColumns } from "@cat/db";
import {
  AsyncStatusSchema,
  ChangeActionSchema,
  EntityTypeSchema,
  RiskLevelSchema,
} from "@cat/shared/schema/enum";
import { safeZDotJson } from "@cat/shared/schema/json";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

export const AddChangesetEntryCommandSchema = z.object({
  changesetId: z.int(),
  entityType: EntityTypeSchema,
  entityId: z.string(),
  action: ChangeActionSchema,
  before: safeZDotJson.optional(),
  after: safeZDotJson.optional(),
  fieldPath: z.string().optional(),
  riskLevel: RiskLevelSchema.default("LOW"),
  asyncStatus: AsyncStatusSchema.nullable().optional(),
  asyncTaskIds: z.array(z.string()).optional(),
});

export type AddChangesetEntryCommand = z.infer<
  typeof AddChangesetEntryCommandSchema
>;

export const addChangesetEntry: Command<
  AddChangesetEntryCommand,
  typeof changesetEntry.$inferSelect
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(changesetEntry)
      .values({
        changesetId: command.changesetId,
        entityType: command.entityType,
        entityId: command.entityId,
        action: command.action,
        before: command.before ?? null,
        after: command.after ?? null,
        fieldPath: command.fieldPath,
        riskLevel: command.riskLevel,
        reviewStatus: "PENDING",
        asyncStatus: command.asyncStatus,
        asyncTaskIds: command.asyncTaskIds ?? null,
      })
      .returning({ ...getColumns(changesetEntry) }),
  );
  return { result: inserted, events: [] };
};
