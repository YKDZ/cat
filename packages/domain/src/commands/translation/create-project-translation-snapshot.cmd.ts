import {
  eq,
  translationSnapshot,
  translationSnapshotItem,
  translatableElement,
} from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

export const CreateProjectTranslationSnapshotCommandSchema = z.object({
  projectId: z.uuidv4(),
  creatorId: z.uuidv4().optional(),
});
export type CreateProjectTranslationSnapshotCommand = z.infer<
  typeof CreateProjectTranslationSnapshotCommandSchema
>;

/**
 * @zh 为项目创建翻译快照，记录当前所有已审批的翻译。
 * @en Create a translation snapshot for the project, recording all currently approved translations.
 * @returns The snapshot ID.
 */
export const createProjectTranslationSnapshot: Command<
  CreateProjectTranslationSnapshotCommand,
  number
> = async (ctx, command) => {
  const snapshotRows = await ctx.db
    .insert(translationSnapshot)
    .values({
      projectId: command.projectId,
      creatorId: command.creatorId ?? null,
    })
    .returning({ id: translationSnapshot.id });

  const snapshotId = snapshotRows[0]!.id;

  // Get all approved translation IDs for the project
  const elements = await ctx.db
    .select({
      approvedTranslationId: translatableElement.approvedTranslationId,
    })
    .from(translatableElement)
    .where(eq(translatableElement.projectId, command.projectId));

  const approvedTranslationIds = elements
    .map((e) => e.approvedTranslationId)
    .filter((id): id is number => id !== null);

  if (approvedTranslationIds.length > 0) {
    await ctx.db.insert(translationSnapshotItem).values(
      approvedTranslationIds.map((translationId) => ({
        snapshotId,
        translationId,
      })),
    );
  }

  return { result: snapshotId, events: [] };
};
