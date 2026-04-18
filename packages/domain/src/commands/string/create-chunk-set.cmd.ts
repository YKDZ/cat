import { chunkSet } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

export const CreateChunkSetCommandSchema = z.object({});

export type CreateChunkSetCommand = z.infer<typeof CreateChunkSetCommandSchema>;

export const createChunkSet: Command<
  CreateChunkSetCommand,
  typeof chunkSet.$inferSelect
> = async (ctx, _command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db.insert(chunkSet).values({}).returning(),
  );

  return {
    result: inserted,
    events: [],
  };
};
