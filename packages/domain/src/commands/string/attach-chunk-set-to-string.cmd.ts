import { inArray, sql, vectorizedString } from "@cat/db";
import * as z from "zod";

import type { Command } from "#/types.ts";

export const AttachChunkSetToStringCommandSchema = z
  .strictObject({
    updates: z.array(
      z.strictObject({
        stringId: z.int().positive(),
        chunkSetId: z.int().positive(),
      }),
    ),
  })
  .superRefine((command, context) => {
    const seenStringIds = new Set<number>();
    for (const [index, update] of command.updates.entries()) {
      if (seenStringIds.has(update.stringId)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate stringId ${update.stringId}.`,
          path: ["updates", index, "stringId"],
        });
      }
      seenStringIds.add(update.stringId);
    }
  });

export type AttachChunkSetToStringCommand = z.infer<
  typeof AttachChunkSetToStringCommandSchema
>;

/**
 * Attach vectorization results (ChunkSet) to existing VectorizedString rows and set status to ACTIVE.
 */
export const attachChunkSetToString: Command<
  AttachChunkSetToStringCommand
> = async (ctx, command) => {
  const parsedCommand = AttachChunkSetToStringCommandSchema.parse(command);
  if (parsedCommand.updates.length === 0) {
    return { result: undefined, events: [] };
  }

  const chunkSetIdChunks = [sql`(CASE`];
  const stringIds: number[] = [];
  for (const update of parsedCommand.updates) {
    chunkSetIdChunks.push(
      sql`WHEN ${vectorizedString.id} = ${update.stringId} THEN ${update.chunkSetId}`,
    );
    stringIds.push(update.stringId);
  }
  chunkSetIdChunks.push(sql`ELSE ${vectorizedString.chunkSetId} END)`);

  await ctx.db
    .update(vectorizedString)
    .set({
      chunkSetId: sql.join(chunkSetIdChunks, sql` `),
      status: "ACTIVE",
    })
    .where(inArray(vectorizedString.id, stringIds));

  return { result: undefined, events: [] };
};
