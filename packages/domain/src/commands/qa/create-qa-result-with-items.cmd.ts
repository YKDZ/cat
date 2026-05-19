import type { JSONType } from "@cat/shared";

import { qaResult, qaResultItem } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
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

export type CreateQaResultWithItemsResult = {
  qaResultId: number;
  itemIds: number[];
};

type TxCapableDb = DbHandle & {
  transaction?: (fn: (tx: DbHandle) => Promise<void>) => Promise<void>;
};

const insertQaResultWithItems = async (
  db: DbHandle,
  command: CreateQaResultWithItemsCommand,
): Promise<CreateQaResultWithItemsResult> => {
  const inserted = assertSingleNonNullish(
    await db
      .insert(qaResult)
      .values({ translationId: command.translationId })
      .returning({ id: qaResult.id }),
  );

  const itemIds =
    command.items.length === 0
      ? []
      : (
          await db
            .insert(qaResultItem)
            .values(
              command.items.map((item) => ({
                isPassed: item.isPassed,
                checkerId: item.checkerId,
                resultId: inserted.id,
                meta: (item.meta ?? null) as JSONType | null,
              })),
            )
            .returning({ id: qaResultItem.id })
        ).map((row) => row.id);

  return {
    qaResultId: inserted.id,
    itemIds,
  };
};

export const createQaResultWithItems: Command<
  CreateQaResultWithItemsCommand,
  CreateQaResultWithItemsResult
> = async (ctx, command) => {
  const txCandidate = ctx.db as TxCapableDb;
  let result!: CreateQaResultWithItemsResult;

  if (typeof txCandidate.transaction === "function") {
    await txCandidate.transaction(async (tx) => {
      result = await insertQaResultWithItems(tx, command);
    });
  } else {
    result = await insertQaResultWithItems(ctx.db, command);
  }

  return {
    result,
    events: [],
  };
};
