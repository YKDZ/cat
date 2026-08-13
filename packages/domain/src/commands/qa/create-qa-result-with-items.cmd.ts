import { agentExternalOutput, and, eq, qaResult, qaResultItem } from "@cat/db";
import {
  assertSingleNonNullish,
  type JSONType,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";
import * as z from "zod";

import { assertActiveAgentRunOwnership } from "#/commands/agent/assert-agent-run-ownership.ts";
import type { Command, DbHandle } from "#/types.ts";

export const CreateQaResultWithItemsCommandSchema = z.object({
  translationId: z.int(),
  items: z.array(
    z.object({
      isPassed: z.boolean(),
      checker: ServiceImplementationReferenceSchema,
      meta: z.json().optional(),
    }),
  ),
  ownershipFence: z
    .object({
      runId: z.uuidv4(),
      ownerId: z.uuidv4(),
      epoch: z.int().positive(),
    })
    .optional(),
  workflowOutput: z
    .object({
      nodeId: z.string().min(1),
      outputKey: z.string().min(1),
      idempotencyKey: z.string().min(1),
    })
    .optional(),
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
  const runInternalId = command.ownershipFence
    ? await assertActiveAgentRunOwnership(db, command.ownershipFence)
    : null;
  if (command.workflowOutput && runInternalId === null) {
    throw new Error("Workflow output idempotency requires an ownership fence.");
  }
  if (command.workflowOutput && runInternalId !== null) {
    const [existing] = await db
      .select({ payload: agentExternalOutput.payload })
      .from(agentExternalOutput)
      .where(
        and(
          eq(agentExternalOutput.runId, runInternalId),
          eq(
            agentExternalOutput.idempotencyKey,
            command.workflowOutput.idempotencyKey,
          ),
        ),
      );
    const parsed = z
      .object({ qaResultId: z.int(), itemIds: z.array(z.int()) })
      .safeParse(existing?.payload);
    if (parsed.success) return parsed.data;
  }
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
                checker: item.checker,
                resultId: inserted.id,
                meta: (item.meta ?? null) as JSONType | null,
              })),
            )
            .returning({ id: qaResultItem.id })
        ).map((row) => row.id);

  const result = {
    qaResultId: inserted.id,
    itemIds,
  };
  if (command.workflowOutput && runInternalId !== null) {
    await db.insert(agentExternalOutput).values({
      runId: runInternalId,
      nodeId: command.workflowOutput.nodeId,
      outputType: "db_write",
      outputKey: command.workflowOutput.outputKey,
      payload: result,
      idempotencyKey: command.workflowOutput.idempotencyKey,
    });
  }
  return result;
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
