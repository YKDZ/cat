import { qaResult } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

export const CreateQaResultCommandSchema = z.object({
  translationId: z.int(),
});

export type CreateQaResultCommand = z.infer<typeof CreateQaResultCommandSchema>;

export const createQaResult: Command<
  CreateQaResultCommand,
  { id: number }
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(qaResult)
      .values({ translationId: command.translationId })
      .returning({ id: qaResult.id }),
  );

  return {
    result: { id: inserted.id },
    events: [],
  };
};
