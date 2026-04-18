import { changesetEntry, eq, and } from "@cat/db";
import { nonNullSafeZDotJson } from "@cat/shared/schema/json";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const UpsertAutoTranslationEntryCommandSchema = z.object({
  changesetId: z.int(),
  entityId: z.string(),
  after: nonNullSafeZDotJson,
});

export type UpsertAutoTranslationEntryCommand = z.infer<
  typeof UpsertAutoTranslationEntryCommandSchema
>;

/**
 * @zh 应用级 upsert：查找已有 auto_translation entry 并更新，否则插入新行。
 * @en Application-level upsert: find existing auto_translation changeset entry and
 * update it, or insert a new one.
 */
export const upsertAutoTranslationEntry: Command<
  UpsertAutoTranslationEntryCommand
> = async (ctx, command) => {
  const { changesetId, entityId, after } = command;

  const existing = await ctx.db
    .select({ id: changesetEntry.id })
    .from(changesetEntry)
    .where(
      and(
        eq(changesetEntry.changesetId, changesetId),
        eq(changesetEntry.entityType, "auto_translation"),
        eq(changesetEntry.entityId, entityId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await ctx.db
      .update(changesetEntry)
      .set({ after: after, updatedAt: new Date() })
      .where(eq(changesetEntry.id, existing[0].id));
  } else {
    await ctx.db.insert(changesetEntry).values({
      changesetId,
      entityType: "auto_translation",
      entityId,
      action: "CREATE",
      before: null,
      after,
      riskLevel: "LOW",
      reviewStatus: "PENDING",
    });
  }

  return { result: undefined, events: [] };
};
