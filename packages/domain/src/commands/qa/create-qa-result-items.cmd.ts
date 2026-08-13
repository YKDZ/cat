import { qaResultItem } from "@cat/db";
import {
  type JSONType,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";
import * as z from "zod";

import type { Command } from "#/types.ts";

export const CreateQaResultItemsCommandSchema = z.object({
  resultId: z.int(),
  items: z.array(
    z.object({
      isPassed: z.boolean(),
      checker: ServiceImplementationReferenceSchema,
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
        checker: item.checker,
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
