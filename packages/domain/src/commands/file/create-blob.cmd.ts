import { blob } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

export const CreateBlobCommandSchema = z.object({
  key: z.string(),
  storageProviderId: z.int(),
  hash: z.instanceof(Buffer).optional(),
});

export type CreateBlobCommand = z.infer<typeof CreateBlobCommandSchema>;

export const createBlob: Command<
  CreateBlobCommand,
  typeof blob.$inferSelect
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(blob)
      .values({
        key: command.key,
        storageProviderId: command.storageProviderId,
        hash: command.hash ?? Buffer.alloc(32),
      })
      .returning(),
  );

  return {
    result: inserted,
    events: [],
  };
};
