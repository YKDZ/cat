import { blob } from "@cat/db";
import {
  assertSingleNonNullish,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";
import * as z from "zod";

import type { Command } from "#/types.ts";

export const CreateBlobCommandSchema = z.object({
  key: z.string(),
  storageProvider: ServiceImplementationReferenceSchema,
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
        storageProvider: command.storageProvider,
        hash: command.hash ?? Buffer.alloc(32),
      })
      .returning(),
  );

  return {
    result: inserted,
    events: [],
  };
};
