import {
  and,
  eq,
  gt,
  isNull,
  or,
  recallDerivationState,
  sql,
  termRecallVariant,
} from "@cat/db";
import {
  CanonicalInputVersionSchema,
  RecallDerivationReferenceSchema,
  RecallDerivationVersionSchema,
  TermRecallVariantDraftSchema,
  type RecallDerivationReference,
} from "@cat/shared";
import * as z from "zod";

import { inDatabaseTransaction } from "#/infrastructure/db-transaction.ts";
import type { Command } from "#/types.ts";

export const PublishTermRecallDerivationCommandSchema = z
  .strictObject({
    targetId: z.string().regex(/^\d+$/),
    conceptId: z.int().positive().nullable(),
    languageId: z.string().min(1),
    demandRevision: z.int().positive(),
    executionEpoch: z.int().positive(),
    leaseToken: z.uuidv4(),
    canonicalInputVersion: CanonicalInputVersionSchema,
    recallDerivationVersion: RecallDerivationVersionSchema,
    variants: z.array(TermRecallVariantDraftSchema),
  })
  .superRefine((input, ctx) => {
    if (input.variants.length > 0 && input.conceptId === null) {
      ctx.addIssue({
        code: "custom",
        message: "conceptId is required when publishing Term variants.",
        path: ["conceptId"],
      });
    }
  });

export type PublishTermRecallDerivationResult =
  | { status: "PUBLISHED"; reference: RecallDerivationReference }
  | { status: "STALE" };

export const publishTermRecallDerivation: Command<
  z.input<typeof PublishTermRecallDerivationCommandSchema>,
  PublishTermRecallDerivationResult
> = async (ctx, input) => {
  const command = PublishTermRecallDerivationCommandSchema.parse(input);
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
        publishedAt: sql`clock_timestamp()`,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          eq(recallDerivationState.targetKind, "TERM_CONCEPT"),
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

    await tx
      .delete(termRecallVariant)
      .where(eq(termRecallVariant.derivationStateId, published.id));
    if (command.variants.length > 0) {
      await tx.insert(termRecallVariant).values(
        command.variants.map((variant) => ({
          derivationStateId: published.id,
          conceptId: command.conceptId!,
          languageId: command.languageId,
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
