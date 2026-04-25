import { file } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

export const CreateFileCommandSchema = z.object({
  name: z.string(),
  blobId: z.int(),
  isActive: z.boolean().optional(),
});

export type CreateFileCommand = z.infer<typeof CreateFileCommandSchema>;

export const createFile: Command<
  CreateFileCommand,
  typeof file.$inferSelect
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(file)
      .values({
        name: command.name,
        blobId: command.blobId,
        isActive: command.isActive ?? false,
      })
      .returning(),
  );

  return {
    result: inserted,
    events: [],
  };
};
