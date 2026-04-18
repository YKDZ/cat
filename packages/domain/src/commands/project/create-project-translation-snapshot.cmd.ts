import {
  and,
  document,
  eq,
  isNotNull,
  project,
  sql,
  translatableElement,
  translationSnapshot,
  translationSnapshotItem,
} from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

export const CreateProjectTranslationSnapshotCommandSchema = z.object({
  projectId: z.uuidv4(),
  creatorId: z.uuidv4().optional(),
});

export type CreateProjectTranslationSnapshotCommand = z.infer<
  typeof CreateProjectTranslationSnapshotCommandSchema
>;

export const createProjectTranslationSnapshot: Command<
  CreateProjectTranslationSnapshotCommand,
  number
> = async (ctx, command) => {
  const translations = await ctx.db
    .select({
      translationId: sql<number>`${translatableElement.approvedTranslationId}`,
      elementId: translatableElement.id,
    })
    .from(translatableElement)
    .innerJoin(document, eq(translatableElement.documentId, document.id))
    .innerJoin(project, eq(document.projectId, project.id))
    .where(
      and(
        eq(project.id, command.projectId),
        isNotNull(translatableElement.approvedTranslationId),
      ),
    );

  if (translations.length === 0) {
    return {
      result: 0,
      events: [],
    };
  }

  const { id: snapshotId } = assertSingleNonNullish(
    await ctx.db
      .insert(translationSnapshot)
      .values({
        projectId: command.projectId,
        creatorId: command.creatorId,
      })
      .returning({ id: translationSnapshot.id }),
  );

  const result = await ctx.db.insert(translationSnapshotItem).values(
    translations.map(({ translationId, elementId }) => ({
      snapshotId,
      translationId,
      elementId,
    })),
  );

  return {
    result: result.rowCount ?? 0,
    events: [],
  };
};
