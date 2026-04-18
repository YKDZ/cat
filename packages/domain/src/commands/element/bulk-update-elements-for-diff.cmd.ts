import type { JSONType } from "@cat/shared/schema/json";

import { inArray, sql, translatableElement } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

export const BulkUpdateElementsForDiffCommandSchema = z.object({
  stringIdUpdates: z
    .array(
      z.object({
        id: z.int(),
        stringId: z.int(),
      }),
    )
    .default([]),
  sortIndexUpdates: z
    .array(
      z.object({
        id: z.int(),
        sortIndex: z.int(),
      }),
    )
    .default([]),
  locationUpdates: z
    .array(
      z.object({
        id: z.int(),
        sourceStartLine: z.int().nullable(),
        sourceEndLine: z.int().nullable(),
        sourceLocationMeta: z.json().nullable(),
      }),
    )
    .default([]),
});

export type BulkUpdateElementsForDiffCommand = z.infer<
  typeof BulkUpdateElementsForDiffCommandSchema
>;

export type BulkUpdateElementsForDiffCommandInput = z.input<
  typeof BulkUpdateElementsForDiffCommandSchema
>;

export const bulkUpdateElementsForDiff: Command<
  BulkUpdateElementsForDiffCommandInput
> = async (ctx, command) => {
  const stringIdUpdates = command.stringIdUpdates ?? [];
  const sortIndexUpdates = command.sortIndexUpdates ?? [];
  const locationUpdates = command.locationUpdates ?? [];

  if (stringIdUpdates.length > 0) {
    const stringIdChunks = [sql`(CASE`];
    const ids: number[] = [];

    for (const update of stringIdUpdates) {
      stringIdChunks.push(
        sql`WHEN ${translatableElement.id} = ${update.id} THEN ${update.stringId}`,
      );
      ids.push(update.id);
    }

    stringIdChunks.push(
      sql`ELSE ${translatableElement.vectorizedStringId} END)`,
    );

    await ctx.db
      .update(translatableElement)
      .set({
        vectorizedStringId: sql.join(stringIdChunks, sql` `),
      })
      .where(inArray(translatableElement.id, ids));
  }

  if (sortIndexUpdates.length > 0) {
    const sortIndexChunks = [sql`(CASE`];
    const ids: number[] = [];

    for (const update of sortIndexUpdates) {
      sortIndexChunks.push(
        sql`WHEN ${translatableElement.id} = ${update.id} THEN ${update.sortIndex}`,
      );
      ids.push(update.id);
    }

    sortIndexChunks.push(sql`ELSE ${translatableElement.sortIndex} END)`);

    await ctx.db
      .update(translatableElement)
      .set({
        sortIndex: sql.join(sortIndexChunks, sql` `),
      })
      .where(inArray(translatableElement.id, ids));
  }

  if (locationUpdates.length > 0) {
    const startLineChunks = [sql`(CASE`];
    const endLineChunks = [sql`(CASE`];
    const metaChunks = [sql`(CASE`];
    const ids: number[] = [];

    for (const update of locationUpdates) {
      startLineChunks.push(
        sql`WHEN ${translatableElement.id} = ${update.id} THEN ${update.sourceStartLine}`,
      );
      endLineChunks.push(
        sql`WHEN ${translatableElement.id} = ${update.id} THEN ${update.sourceEndLine}`,
      );
      metaChunks.push(
        sql`WHEN ${translatableElement.id} = ${update.id} THEN ${update.sourceLocationMeta ? sql`${JSON.stringify(update.sourceLocationMeta as JSONType)}::jsonb` : sql`NULL`}`,
      );
      ids.push(update.id);
    }

    startLineChunks.push(sql`ELSE ${translatableElement.sourceStartLine} END)`);
    endLineChunks.push(sql`ELSE ${translatableElement.sourceEndLine} END)`);
    metaChunks.push(sql`ELSE ${translatableElement.sourceLocationMeta} END)`);

    await ctx.db
      .update(translatableElement)
      .set({
        sourceStartLine: sql.join(startLineChunks, sql` `),
        sourceEndLine: sql.join(endLineChunks, sql` `),
        sourceLocationMeta: sql.join(metaChunks, sql` `),
      })
      .where(inArray(translatableElement.id, ids));
  }

  return {
    result: undefined,
    events: [],
  };
};
