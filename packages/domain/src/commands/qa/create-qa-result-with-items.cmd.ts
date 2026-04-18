import type { JSONType } from "@cat/shared/schema/json";

import { qaResult, qaResultItem } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command, DbHandle } from "@/types";

export const CreateQaResultWithItemsCommandSchema = z.object({
  translationId: z.int(),
  items: z.array(
    z.object({
      isPassed: z.boolean(),
      checkerId: z.int(),
      meta: z.json().optional(),
    }),
  ),
});

export type CreateQaResultWithItemsCommand = z.infer<
  typeof CreateQaResultWithItemsCommandSchema
>;

type TxCapableDb = DbHandle & {
  transaction?: (fn: (tx: DbHandle) => Promise<void>) => Promise<void>;
};

const insertQaResultWithItems = async (
  db: DbHandle,
  command: CreateQaResultWithItemsCommand,
) => {
  const inserted = assertSingleNonNullish(
    await db
      .insert(qaResult)
      .values({ translationId: command.translationId })
      .returning({ id: qaResult.id }),
  );

  if (command.items.length > 0) {
    await db.insert(qaResultItem).values(
      command.items.map((item) => ({
        isPassed: item.isPassed,
        checkerId: item.checkerId,
        resultId: inserted.id,
        meta: (item.meta ?? null) as JSONType | null,
      })),
    );
  }
};

export const createQaResultWithItems: Command<
  CreateQaResultWithItemsCommand
> = async (ctx, command) => {
  const txCandidate = ctx.db as TxCapableDb;

  if (typeof txCandidate.transaction === "function") {
    await txCandidate.transaction(async (tx) => {
      await insertQaResultWithItems(tx, command);
    });
  } else {
    await insertQaResultWithItems(ctx.db, command);
  }

  return {
    result: undefined,
    events: [],
  };
};
