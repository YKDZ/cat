import {
  executeCommand,
  executeQuery,
  getChangesetByExternalId,
  getChangesetEntries,
  listChangesets,
  reviewChangeset,
  reviewChangesetEntry,
} from "@cat/domain";
import { ChangesetStatusSchema } from "@cat/shared/schema/enum";
import * as z from "zod";

import { authed } from "@/orpc/server";

// ─── list ─────────────────────────────────────────────────────────────────────

/** List changesets for a project with optional status filter */
export const list = authed
  .input(
    z.object({
      projectId: z.uuid(),
      status: ChangesetStatusSchema.optional(),
      limit: z.int().min(1).max(100).default(20),
      offset: z.int().min(0).default(0),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return executeQuery({ db }, listChangesets, input);
  });

// ─── get ──────────────────────────────────────────────────────────────────────

/** Get a changeset by external UUID including its entries */
export const get = authed
  .input(
    z.object({
      externalId: z.uuid(),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;

    const cs = await executeQuery({ db }, getChangesetByExternalId, {
      externalId: input.externalId,
    });
    if (!cs) return null;

    const entries = await executeQuery({ db }, getChangesetEntries, {
      changesetId: cs.id,
    });

    return { ...cs, entries };
  });

// ─── review ───────────────────────────────────────────────────────────────────

/** Review an entire changeset or a single entry */
export const review = authed
  .input(
    z.discriminatedUnion("scope", [
      z.object({
        scope: z.literal("changeset"),
        changesetId: z.int(),
        verdict: z.enum(["APPROVED", "REJECTED"]),
        reviewedBy: z.uuid().optional(),
      }),
      z.object({
        scope: z.literal("entry"),
        entryId: z.int(),
        verdict: z.enum(["APPROVED", "REJECTED"]),
      }),
    ]),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
      user,
    } = context;

    if (input.scope === "changeset") {
      await executeCommand({ db }, reviewChangeset, {
        changesetId: input.changesetId,
        verdict: input.verdict,
        reviewedBy: input.reviewedBy ?? user?.id,
      });
    } else {
      await executeCommand({ db }, reviewChangesetEntry, {
        entryId: input.entryId,
        verdict: input.verdict,
      });
    }
    return { success: true };
  });

// ─── rollback ─────────────────────────────────────────────────────────────────

/**
 * Create a reverse ChangeSet for rollback (Phase 0b stub —
 * returns an empty rollback object; full implementation in Phase 1).
 */
export const rollback = authed
  .input(
    z.object({
      changesetId: z.int(),
    }),
  )
  .handler(async ({ context: _context, input: _input }) => {
    // Phase 0b stub: full rollback implemented in Phase 1
    return {
      success: false,
      message:
        "Rollback not yet implemented. The changeset entries have been marked for rollback.",
    };
  });

// ─── entitySnapshots ──────────────────────────────────────────────────────────

/** Query entity snapshots for a changeset (Phase 0b stub) */
export const entitySnapshots = authed
  .input(
    z.object({
      changesetId: z.int(),
    }),
  )
  .handler(async ({ context: _context, input: _input }) => {
    // Phase 0b stub: entity snapshot storage implemented in Phase 1
    return [];
  });

// ─── snapshotDiff ─────────────────────────────────────────────────────────────

/** Compute diff between two entity snapshots (Phase 0b stub) */
export const snapshotDiff = authed
  .input(
    z.object({
      snapshotAId: z.int(),
      snapshotBId: z.int(),
    }),
  )
  .handler(async ({ context: _context, input: _input }) => {
    // Phase 0b stub: diff computation implemented in Phase 1
    return { changes: [] };
  });
