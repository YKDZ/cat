import {
  and,
  asc,
  eq,
  memoryItem,
  memoryItemDeletion,
  recallDerivationState,
  sql,
} from "@cat/db";
import {
  assertSingleOrNull,
  computeMemoryDeletionCanonicalInputVersion,
  MemoryDeletionScopeValues,
  RecallDerivationReferenceSchema,
  type RecallDerivationReference,
} from "@cat/shared";
import * as z from "zod";

import { inDatabaseTransaction } from "#/infrastructure/db-transaction.ts";
import { listMemoryCanonicalSnapshots } from "#/queries/recall-derivation/get-memory-canonical-snapshots.query.ts";
import type { DbHandle, Command } from "#/types.ts";

export const DeleteMemoryItemCommandSchema = z.object({
  memoryItemId: z.int(),
  deletedById: z.uuidv4().nullable(),
  scope: z.enum(MemoryDeletionScopeValues),
  projectId: z.uuidv4().nullable(),
  reason: z.string().optional(),
});

export type DeleteMemoryItemCommand = z.infer<
  typeof DeleteMemoryItemCommandSchema
>;

export type DeleteMemoryItemResult = {
  deleted: boolean;
  derivations: RecallDerivationReference[];
};

/**
 * The derivation-state lock precedes the Memory Item lock, matching publish.
 * This prevents a publisher holding a state lock from deadlocking with delete.
 */
export const deleteMemoryItemInTransaction = async (
  tx: DbHandle,
  command: DeleteMemoryItemCommand,
): Promise<DeleteMemoryItemResult> => {
  const initialSnapshot = (
    await listMemoryCanonicalSnapshots({ db: tx }, [command.memoryItemId])
  )[0];
  if (!initialSnapshot) return { deleted: false, derivations: [] };

  // Keep the target-state lock order stable across same-language Memory Items.
  const lockedStates = await tx
    .select({
      id: recallDerivationState.id,
      languageId: recallDerivationState.languageId,
    })
    .from(recallDerivationState)
    .where(
      and(
        eq(recallDerivationState.targetKind, "MEMORY_ITEM"),
        eq(recallDerivationState.targetId, String(command.memoryItemId)),
      ),
    )
    .orderBy(
      asc(recallDerivationState.languageId),
      asc(recallDerivationState.id),
    )
    .for("update");

  const existing = assertSingleOrNull(
    await tx
      .select({ id: memoryItem.id, memoryId: memoryItem.memoryId })
      .from(memoryItem)
      .where(eq(memoryItem.id, command.memoryItemId))
      .limit(1)
      .for("update"),
  );
  if (!existing) return { deleted: false, derivations: [] };

  const [snapshot] = await listMemoryCanonicalSnapshots({ db: tx }, [
    existing.id,
  ]);
  if (!snapshot) {
    throw new TypeError(
      `Memory Item ${existing.id} has no complete canonical snapshot.`,
    );
  }
  const languageIds = [
    ...new Set([
      snapshot.source.languageId,
      snapshot.translation.languageId,
      ...lockedStates.map((state) => state.languageId),
    ]),
  ].sort();
  const canonicalInputVersion =
    await computeMemoryDeletionCanonicalInputVersion({
      targetId: String(existing.id),
      memoryId: existing.memoryId,
      languageIds,
    });

  await tx.insert(memoryItemDeletion).values({
    deletedMemoryItemId: existing.id,
    memoryId: existing.memoryId,
    projectId: command.projectId,
    deletedById: command.deletedById,
    scope: command.scope,
    reason: command.reason,
  });

  const states = await tx
    .insert(recallDerivationState)
    .values(
      languageIds.map((languageId) => ({
        targetKind: "MEMORY_ITEM" as const,
        targetId: String(existing.id),
        languageId,
        canonicalInputVersion,
      })),
    )
    .onConflictDoUpdate({
      target: [
        recallDerivationState.targetKind,
        recallDerivationState.targetId,
        recallDerivationState.languageId,
      ],
      set: {
        canonicalInputVersion,
        demandRevision: sql`${recallDerivationState.demandRevision} + 1`,
        status: "PENDING",
        leaseOwnerId: null,
        leaseToken: null,
        leaseExpiresAt: null,
        retryCount: 0,
        nextAttemptAt: null,
        blocker: null,
        requiredDerivationVersion: null,
        updatedAt: sql`clock_timestamp()`,
      },
    })
    .returning({
      targetKind: recallDerivationState.targetKind,
      targetId: recallDerivationState.targetId,
      languageId: recallDerivationState.languageId,
      demandRevision: recallDerivationState.demandRevision,
    });

  await tx.delete(memoryItem).where(eq(memoryItem.id, existing.id));
  return {
    deleted: true,
    derivations: states.map((state) =>
      RecallDerivationReferenceSchema.parse(state),
    ),
  };
};

export const deleteMemoryItem: Command<
  DeleteMemoryItemCommand,
  DeleteMemoryItemResult
> = async (ctx, command) => {
  const parsed = DeleteMemoryItemCommandSchema.parse(command);
  const result = await inDatabaseTransaction(
    ctx.db,
    async (tx) => await deleteMemoryItemInTransaction(tx, parsed),
  );
  return { result, events: [] };
};
