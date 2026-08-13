import {
  and,
  asc,
  eq,
  inArray,
  memory,
  memoryItem,
  or,
  recallDerivationState,
  sql,
} from "@cat/db";
import type { RecallDerivationReference } from "@cat/shared";
import * as z from "zod";

import { registerMemoryRecallDerivationDemands } from "#/commands/recall-derivation/register-memory-recall-derivation-demands.ts";
import { inDatabaseTransaction } from "#/infrastructure/db-transaction.ts";
import type { Command } from "#/types.ts";

const MemoryItemInputSchema = z.object({
  memoryItemId: z.int().positive().optional(),
  translationId: z.int().nullable(),
  translationStringId: z.int(),
  sourceStringId: z.int(),
  creatorId: z.string().nullable(),
});

export const CreateMemoryItemsCommandSchema = z.object({
  memoryId: z.string(),
  items: z.array(MemoryItemInputSchema),
});

export type CreateMemoryItemsCommand = z.infer<
  typeof CreateMemoryItemsCommandSchema
>;

export type CreatedMemoryItemRow = {
  id: number;
  memoryId: string;
  translationId: number | null;
  translationStringId: number;
  sourceStringId: number;
};

export type CreateMemoryItemsResult = {
  items: CreatedMemoryItemRow[];
  derivations: RecallDerivationReference[];
};

const memoryIdentityKey = (memoryId: string, translationId: number): string =>
  JSON.stringify([memoryId, translationId]);

export const createMemoryItems: Command<
  CreateMemoryItemsCommand,
  CreateMemoryItemsResult
> = async (ctx, command) => {
  const parsed = CreateMemoryItemsCommandSchema.parse(command);
  if (parsed.items.length === 0) {
    return { result: { items: [], derivations: [] }, events: [] };
  }

  const result = await inDatabaseTransaction(ctx.db, async (tx) => {
    const requestedIdentityById = new Map<number, number | null>();
    const requestedIdByIdentity = new Map<string, number>();
    for (const item of parsed.items) {
      if (item.memoryItemId !== undefined) {
        const previous = requestedIdentityById.get(item.memoryItemId);
        if (previous !== undefined && previous !== item.translationId) {
          throw new TypeError(
            `Memory Item ${item.memoryItemId} has conflicting requested identities.`,
          );
        }
        requestedIdentityById.set(item.memoryItemId, item.translationId);
      }
      if (item.translationId !== null && item.memoryItemId !== undefined) {
        const key = memoryIdentityKey(parsed.memoryId, item.translationId);
        const previous = requestedIdByIdentity.get(key);
        if (previous !== undefined && previous !== item.memoryItemId) {
          throw new TypeError(
            `Memory Item identity ${key} has conflicting requested IDs.`,
          );
        }
        requestedIdByIdentity.set(key, item.memoryItemId);
      }
    }
    const conflictKeys = [
      ...new Set(
        parsed.items.flatMap((item) =>
          item.translationId === null
            ? []
            : [memoryIdentityKey(parsed.memoryId, item.translationId)],
        ),
      ),
    ].sort();
    for (const conflictKey of conflictKeys) {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${conflictKey}, 0))`,
      );
    }

    const explicitIds = [
      ...new Set(
        parsed.items.flatMap((item) =>
          item.memoryItemId === undefined ? [] : [item.memoryItemId],
        ),
      ),
    ];
    const translationIds = [
      ...new Set(
        parsed.items.flatMap((item) =>
          item.translationId === null ? [] : [item.translationId],
        ),
      ),
    ];
    const existingConditions = [
      ...(explicitIds.length === 0
        ? []
        : [inArray(memoryItem.id, explicitIds)]),
      ...(translationIds.length === 0
        ? []
        : [
            and(
              eq(memoryItem.memoryId, parsed.memoryId),
              inArray(memoryItem.translationId, translationIds),
            )!,
          ]),
    ];
    const candidates =
      existingConditions.length === 0
        ? []
        : await tx
            .select({
              id: memoryItem.id,
              memoryId: memoryItem.memoryId,
              translationId: memoryItem.translationId,
            })
            .from(memoryItem)
            .where(or(...existingConditions));
    const candidateIds = [...new Set(candidates.map((item) => item.id))].sort(
      (left, right) => left - right,
    );
    const targetStateIds = [...new Set([...candidateIds, ...explicitIds])].sort(
      (left, right) => left - right,
    );
    if (targetStateIds.length > 0) {
      await tx
        .select({ id: recallDerivationState.id })
        .from(recallDerivationState)
        .where(
          and(
            eq(recallDerivationState.targetKind, "MEMORY_ITEM"),
            inArray(recallDerivationState.targetId, targetStateIds.map(String)),
          ),
        )
        .orderBy(
          sql`${recallDerivationState.targetId}::bigint`,
          asc(recallDerivationState.languageId),
          asc(recallDerivationState.id),
        )
        .for("update");
    }
    if (explicitIds.length > 0) {
      const [targetMemory] = await tx
        .select({ id: memory.id })
        .from(memory)
        .where(eq(memory.id, parsed.memoryId))
        .limit(1)
        .for("key share");
      if (!targetMemory) {
        throw new TypeError(`Memory ${parsed.memoryId} does not exist.`);
      }
      await tx.execute(
        sql`LOCK TABLE ${memoryItem} IN SHARE ROW EXCLUSIVE MODE`,
      );
    }
    const existing =
      existingConditions.length === 0
        ? []
        : await tx
            .select({
              id: memoryItem.id,
              memoryId: memoryItem.memoryId,
              translationId: memoryItem.translationId,
            })
            .from(memoryItem)
            .where(or(...existingConditions))
            .orderBy(asc(memoryItem.id))
            .for("update");
    const existingById = new Map(existing.map((item) => [item.id, item]));
    const existingByIdentity = new Map(
      existing.flatMap((item) =>
        item.translationId === null
          ? []
          : [
              [
                memoryIdentityKey(item.memoryId, item.translationId),
                item,
              ] as const,
            ],
      ),
    );
    for (const item of parsed.items) {
      if (item.memoryItemId === undefined) continue;
      const idMatch = existingById.get(item.memoryItemId);
      const identityMatch =
        item.translationId === null
          ? undefined
          : existingByIdentity.get(
              memoryIdentityKey(parsed.memoryId, item.translationId),
            );
      if (
        idMatch &&
        (idMatch.memoryId !== parsed.memoryId ||
          idMatch.translationId !== item.translationId)
      ) {
        throw new TypeError(
          `Memory Item ${item.memoryItemId} identity does not match the request.`,
        );
      }
      if (identityMatch && identityMatch.id !== item.memoryItemId) {
        throw new TypeError(
          `Memory Item identity belongs to ${identityMatch.id}, not ${item.memoryItemId}.`,
        );
      }
    }

    const indexedItems = parsed.items.map((item, index) => {
      const existingItem =
        (item.memoryItemId === undefined
          ? undefined
          : existingById.get(item.memoryItemId)) ??
        (item.translationId === null
          ? undefined
          : existingByIdentity.get(
              memoryIdentityKey(parsed.memoryId, item.translationId),
            ));
      return { item, index, existingId: existingItem?.id };
    });
    indexedItems.sort(
      (left, right) =>
        (left.existingId ?? left.item.memoryItemId ?? Number.MAX_SAFE_INTEGER) -
          (right.existingId ??
            right.item.memoryItemId ??
            Number.MAX_SAFE_INTEGER) ||
        String(left.item.translationId ?? "").localeCompare(
          String(right.item.translationId ?? ""),
        ) ||
        left.index - right.index,
    );
    const insertedByIndex = new Map<number, CreatedMemoryItemRow>();
    for (const { item, index } of indexedItems) {
      const values = {
        memoryId: parsed.memoryId,
        translationId: item.translationId,
        translationStringId: item.translationStringId,
        sourceStringId: item.sourceStringId,
        creatorId: item.creatorId,
      };
      const update = {
        translationStringId: sql`excluded.translation_string_id`,
        sourceStringId: sql`excluded.source_string_id`,
        creatorId: sql`excluded.creator_id`,
        updatedAt: new Date(),
      };
      const insert = tx
        .insert(memoryItem)
        .values(
          item.memoryItemId === undefined
            ? values
            : { ...values, id: item.memoryItemId },
        );
      const rows = await insert
        .onConflictDoUpdate({
          target:
            item.memoryItemId === undefined
              ? [memoryItem.memoryId, memoryItem.translationId]
              : memoryItem.id,
          set: update,
        })
        .returning({
          id: memoryItem.id,
          memoryId: memoryItem.memoryId,
          translationId: memoryItem.translationId,
          translationStringId: memoryItem.translationStringId,
          sourceStringId: memoryItem.sourceStringId,
        });
      const [row] = rows;
      if (!row) throw new TypeError("Memory Item upsert did not return a row.");
      insertedByIndex.set(index, row);
    }
    if (explicitIds.length > 0) {
      await tx.execute(sql`
        WITH sequence_ref AS (
          SELECT pg_get_serial_sequence(
            format('%I.%I', current_schema(), 'MemoryItem'),
            'id'
          )::regclass AS sequence_id
        )
        SELECT setval(
          sequence_id,
          GREATEST(
            COALESCE((SELECT max(${memoryItem.id}) FROM ${memoryItem}), 1),
            COALESCE(pg_sequence_last_value(sequence_id), 1)
          ),
          true
        )
        FROM sequence_ref
      `);
    }
    const inserted = parsed.items.map((_, index) => {
      const row = insertedByIndex.get(index);
      if (!row) throw new TypeError("Memory Item upsert lost its result row.");
      return row;
    });
    const derivations = await registerMemoryRecallDerivationDemands(
      tx,
      [...new Set(inserted.map((item) => item.id))].sort(
        (left, right) => left - right,
      ),
    );
    return { items: inserted, derivations };
  });

  return { result, events: [] };
};
