import type { JSONType } from "@cat/shared/schema/json";

import { qaResultItem } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const CreateQaResultItemsCommandSchema = z.object({
  resultId: z.int(),
  items: z.array(
    z.object({
      isPassed: z.boolean(),
      checkerId: z.int(),
      meta: z.json().optional(),
    }),
  ),
});

export type CreateQaResultItemsCommand = z.infer<
  typeof CreateQaResultItemsCommandSchema
>;

export const createQaResultItems: Command<CreateQaResultItemsCommand> = async (
  ctx,
  command,
) => {
  if (command.items.length > 0) {
    await ctx.db.insert(qaResultItem).values(
      command.items.map((item) => ({
        isPassed: item.isPassed,
        checkerId: item.checkerId,
        resultId: command.resultId,
        meta: (item.meta ?? null) as JSONType | null,
      })),
    );
  }

  return {
    result: undefined,
    events: [],
  };
};
