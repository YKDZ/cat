import {
  and,
  eq,
  gt,
  isNull,
  memoryRecallVariant,
  or,
  recallDerivationState,
  sql,
} from "@cat/db";
import {
  CanonicalInputVersionSchema,
  MemoryRecallVariantDraftSchema,
  RecallDerivationReferenceSchema,
  RecallDerivationVersionSchema,
  type RecallDerivationReference,
} from "@cat/shared";
import * as z from "zod";

import { inDatabaseTransaction } from "#/infrastructure/db-transaction.ts";
import type { Command } from "#/types.ts";

export const PublishMemoryRecallDerivationCommandSchema = z
  .strictObject({
    targetId: z.string().regex(/^\d+$/),
    memoryId: z.uuidv4().nullable(),
    languageId: z.string().min(1),
    demandRevision: z.int().positive(),
    executionEpoch: z.int().positive(),
    leaseToken: z.uuidv4(),
    canonicalInputVersion: CanonicalInputVersionSchema,
    recallDerivationVersion: RecallDerivationVersionSchema,
    variants: z.array(MemoryRecallVariantDraftSchema),
  })
  .superRefine((input, ctx) => {
    if (input.variants.length > 0 && input.memoryId === null) {
      ctx.addIssue({
        code: "custom",
        message: "memoryId is required when publishing Memory variants.",
        path: ["memoryId"],
      });
    }
  });

export type PublishMemoryRecallDerivationResult =
  | { status: "PUBLISHED"; reference: RecallDerivationReference }
  | { status: "STALE" };

export const publishMemoryRecallDerivation: Command<
  z.input<typeof PublishMemoryRecallDerivationCommandSchema>,
  PublishMemoryRecallDerivationResult
> = async (ctx, input) => {
  const command = PublishMemoryRecallDerivationCommandSchema.parse(input);
  const result = await inDatabaseTransaction(ctx.db, async (tx) => {
    const [published] = await tx
      .update(recallDerivationState)
      .set({
        status: "FRESH",
        requiredDerivationVersion: command.recallDerivationVersion,
        currentCanonicalInputVersion: command.canonicalInputVersion,
        currentDerivationVersion: command.recallDerivationVersion,
        leaseOwnerId: null,
        leaseToken: null,
        leaseExpiresAt: null,
        retryCount: 0,
        nextAttemptAt: null,
        blocker: null,
        taskProjectionRevision: sql`${recallDerivationState.taskProjectionRevision} + 1`,
        publishedAt: sql`clock_timestamp()`,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          eq(recallDerivationState.targetKind, "MEMORY_ITEM"),
          eq(recallDerivationState.targetId, command.targetId),
          eq(recallDerivationState.languageId, command.languageId),
          eq(recallDerivationState.status, "RUNNING"),
          eq(recallDerivationState.demandRevision, command.demandRevision),
          eq(recallDerivationState.executionEpoch, command.executionEpoch),
          eq(
            recallDerivationState.canonicalInputVersion,
            command.canonicalInputVersion,
          ),
          or(
            isNull(recallDerivationState.requiredDerivationVersion),
            eq(
              recallDerivationState.requiredDerivationVersion,
              command.recallDerivationVersion,
            ),
          ),
          eq(recallDerivationState.leaseToken, command.leaseToken),
          gt(recallDerivationState.leaseExpiresAt, sql`clock_timestamp()`),
        ),
      )
      .returning({
        id: recallDerivationState.id,
        targetKind: recallDerivationState.targetKind,
        targetId: recallDerivationState.targetId,
        languageId: recallDerivationState.languageId,
        demandRevision: recallDerivationState.demandRevision,
      });

    if (!published) return { status: "STALE" as const };

    const memoryItemId = Number(command.targetId);
    await tx
      .delete(memoryRecallVariant)
      .where(
        and(
          eq(memoryRecallVariant.memoryItemId, memoryItemId),
          eq(memoryRecallVariant.languageId, command.languageId),
        ),
      );
    if (command.variants.length > 0) {
      await tx.insert(memoryRecallVariant).values(
        command.variants.map((variant) => ({
          memoryItemId,
          derivationStateId: published.id,
          memoryId: command.memoryId!,
          languageId: command.languageId,
          querySide: variant.querySide,
          text: variant.text,
          normalizedText: variant.normalizedText,
          variantType: variant.variantType,
          meta: variant.meta,
          canonicalInputVersion: command.canonicalInputVersion,
          recallDerivationVersion: command.recallDerivationVersion,
        })),
      );
    }
    return {
      status: "PUBLISHED" as const,
      reference: RecallDerivationReferenceSchema.parse({
        targetKind: published.targetKind,
        targetId: published.targetId,
        languageId: published.languageId,
        demandRevision: published.demandRevision,
      }),
    };
  });
  return { result, events: [] };
};
