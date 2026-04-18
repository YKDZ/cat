import { mfaProvider } from "@cat/db";
import { nonNullSafeZDotJson } from "@cat/shared/schema/json";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

export const CreateMfaProviderCommandSchema = z.object({
  userId: z.uuidv4(),
  mfaServiceId: z.int(),
  payload: nonNullSafeZDotJson,
});

export type CreateMfaProviderCommand = z.infer<
  typeof CreateMfaProviderCommandSchema
>;

export const createMfaProvider: Command<
  CreateMfaProviderCommand,
  typeof mfaProvider.$inferSelect
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(mfaProvider)
      .values({
        userId: command.userId,
        mfaServiceId: command.mfaServiceId,
        payload: command.payload,
      })
      .returning(),
  );

  return {
    result: inserted,
    events: [],
  };
};
