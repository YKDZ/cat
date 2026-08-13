import {
  and,
  asc,
  eq,
  inArray,
  memory,
  memoryItem,
  recallDerivationState,
  sql,
} from "@cat/db";
import {
  assertSingleOrNull,
  type RecallDerivationReference,
} from "@cat/shared";
import * as z from "zod";

import {
  deleteMemoryItemInTransaction,
  type DeleteMemoryItemResult,
} from "#/commands/memory/delete-memory-item.cmd.ts";
import { inDatabaseTransaction } from "#/infrastructure/db-transaction.ts";
import type { Command } from "#/types.ts";

export const DeleteMemoryCommandSchema = z.object({
  memoryId: z.uuidv4(),
  deletedById: z.uuidv4().nullable(),
  projectId: z.uuidv4().nullable(),
  reason: z.string().optional(),
});

export type DeleteMemoryCommand = z.infer<typeof DeleteMemoryCommandSchema>;

export type DeleteMemoryResult = {
  deleted: boolean;
  itemCount: number;
  derivations: RecallDerivationReference[];
};

class MemoryDeleteRetryError extends Error {
  constructor() {
    super("Memory items changed while acquiring governed delete locks.");
  }
}

export const deleteMemory: Command<
  DeleteMemoryCommand,
  DeleteMemoryResult
> = async (ctx, input) => {
  const command = DeleteMemoryCommandSchema.parse(input);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await inDatabaseTransaction(ctx.db, async (tx) => {
        const initialItemIds = await tx
          .select({ id: memoryItem.id })
          .from(memoryItem)
          .where(eq(memoryItem.memoryId, command.memoryId))
          .orderBy(asc(memoryItem.id));
        const targetIds = initialItemIds.map((item) => String(item.id));
        if (targetIds.length > 0) {
          await tx
            .select({ id: recallDerivationState.id })
            .from(recallDerivationState)
            .where(
              and(
                eq(recallDerivationState.targetKind, "MEMORY_ITEM"),
                inArray(recallDerivationState.targetId, targetIds),
              ),
            )
            .orderBy(
              sql`${recallDerivationState.targetId}::bigint`,
              asc(recallDerivationState.languageId),
              asc(recallDerivationState.id),
            )
            .for("update");
        }

        const existing = assertSingleOrNull(
          await tx
            .select({ id: memory.id, scope: memory.scope })
            .from(memory)
            .where(eq(memory.id, command.memoryId))
            .limit(1)
            .for("update"),
        );
        if (!existing) {
          return { deleted: false, itemCount: 0, derivations: [] };
        }

        const itemIds = await tx
          .select({ id: memoryItem.id })
          .from(memoryItem)
          .where(eq(memoryItem.memoryId, existing.id))
          .orderBy(asc(memoryItem.id));
        if (
          itemIds.length !== initialItemIds.length ||
          itemIds.some((item, index) => item.id !== initialItemIds[index]?.id)
        ) {
          throw new MemoryDeleteRetryError();
        }

        const deletedItems: DeleteMemoryItemResult[] = [];
        for (const item of itemIds) {
          deletedItems.push(
            await deleteMemoryItemInTransaction(tx, {
              memoryItemId: item.id,
              deletedById: command.deletedById,
              scope: existing.scope,
              projectId: command.projectId,
              reason: command.reason,
            }),
          );
        }

        await tx.delete(memory).where(eq(memory.id, existing.id));
        return {
          deleted: true,
          itemCount: deletedItems.filter((item) => item.deleted).length,
          derivations: deletedItems.flatMap((item) => item.derivations),
        };
      });
      return { result, events: [] };
    } catch (error) {
      if (!(error instanceof MemoryDeleteRetryError) || attempt === 2) {
        throw error;
      }
    }
  }
  throw new TypeError("Memory delete retry loop exited unexpectedly.");
};
