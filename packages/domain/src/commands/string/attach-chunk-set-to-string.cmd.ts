import { eq, vectorizedString } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

export const AttachChunkSetToStringCommandSchema = z.object({
  updates: z.array(
    z.object({
      stringId: z.int(),
      chunkSetId: z.int(),
    }),
  ),
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
  if (command.updates.length === 0) {
    return { result: undefined, events: [] };
  }

  await Promise.all(
    command.updates.map((u) =>
      ctx.db
        .update(vectorizedString)
        .set({ chunkSetId: u.chunkSetId, status: "ACTIVE" })
        .where(eq(vectorizedString.id, u.stringId)),
    ),
  );

  return { result: undefined, events: [] };
};
