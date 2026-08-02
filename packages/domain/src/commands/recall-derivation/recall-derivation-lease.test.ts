import { recallDerivationState } from "@cat/db";
import { CanonicalInputVersionSchema } from "@cat/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  claimRecallDerivationDemands,
  ensureLanguages,
  recordRecallDerivationFailure,
  reconcileRecallDerivationDemands,
  renewRecallDerivationLease,
} from "#/commands/index.ts";
import { executeCommand } from "#/executor.ts";
import { setupTestDB, type TestDB } from "#/testing/setup-test-db.ts";

describe("Recall Derivation leases", () => {
  let db: TestDB;

  beforeEach(async () => {
    db = await setupTestDB();
    await executeCommand({ db: db.client }, ensureLanguages, {
      languageIds: ["en"],
    });
    await db.client.insert(recallDerivationState).values({
      canonicalInputVersion: CanonicalInputVersionSchema.parse(
        `sha256:${"a".repeat(64)}`,
      ),
      languageId: "en",
      targetId: "42",
      targetKind: "MEMORY_ITEM",
    });
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it("leases each demand to only one concurrent worker", async () => {
    const concurrent = await db.openConcurrentClient();
    try {
      const [first, second] = await Promise.all([
        executeCommand({ db: db.client }, claimRecallDerivationDemands, {
          leaseDurationMs: 60_000,
          limit: 1,
          workerId: crypto.randomUUID(),
        }),
        executeCommand(
          { db: concurrent.client },
          claimRecallDerivationDemands,
          {
            leaseDurationMs: 60_000,
            limit: 1,
            workerId: crypto.randomUUID(),
          },
        ),
      ]);

      expect(first.length + second.length).toBe(1);
      expect([...first, ...second][0]?.status).toBe("RUNNING");
    } finally {
      await concurrent.cleanup();
    }
  });

  it("recovers an expired lease after process interruption", async () => {
    const interrupted = await db.openConcurrentClient();
    const workerId = crypto.randomUUID();
    const claimed = await executeCommand(
      { db: interrupted.client },
      claimRecallDerivationDemands,
      { leaseDurationMs: 3_000, limit: 1, workerId },
    );
    expect(claimed).toHaveLength(1);
    await interrupted.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 3_100));

    const recovered = await executeCommand(
      { db: db.client },
      reconcileRecallDerivationDemands,
      {},
    );
    const reclaimed = await executeCommand(
      { db: db.client },
      claimRecallDerivationDemands,
      {
        leaseDurationMs: 60_000,
        limit: 1,
        workerId: crypto.randomUUID(),
      },
    );

    expect(recovered.expiredLeaseCount).toBe(1);
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]?.demandRevision).toBe(claimed[0]?.demandRevision);
    expect(reclaimed[0]?.leaseToken).not.toBe(claimed[0]?.leaseToken);
    expect(reclaimed[0]?.executionEpoch).toBe(
      (claimed[0]?.executionEpoch ?? 0) + 1,
    );
  });

  it("fences old attempts and applies bounded exponential retry", async () => {
    const [claim] = await executeCommand(
      { db: db.client },
      claimRecallDerivationDemands,
      {
        leaseDurationMs: 60_000,
        limit: 1,
        workerId: crypto.randomUUID(),
      },
    );
    const fence = {
      stateId: claim!.id,
      demandRevision: claim!.demandRevision,
      executionEpoch: claim!.executionEpoch,
      leaseToken: claim!.leaseToken!,
      canonicalInputVersion: claim!.canonicalInputVersion,
    };
    const renewed = await executeCommand(
      { db: db.client },
      renewRecallDerivationLease,
      { ...fence, leaseDurationMs: 60_000 },
    );
    expect(renewed).toEqual({ renewed: true });

    const retry = await executeCommand(
      { db: db.client },
      recordRecallDerivationFailure,
      {
        ...fence,
        blocker: {
          reason: "LANGUAGE_ANALYSIS",
          retryable: true,
          message: "temporarily unavailable",
        },
        maxAttempts: 2,
        initialBackoffMs: 100,
        maxBackoffMs: 1_000,
      },
    );
    expect(retry).toEqual({ status: "PENDING", retryCount: 1 });
    await db.client
      .update(recallDerivationState)
      .set({ nextAttemptAt: new Date(0) });
    const [reclaimed] = await executeCommand(
      { db: db.client },
      claimRecallDerivationDemands,
      {
        leaseDurationMs: 60_000,
        limit: 1,
        workerId: crypto.randomUUID(),
      },
    );
    const stale = await executeCommand(
      { db: db.client },
      recordRecallDerivationFailure,
      {
        ...fence,
        blocker: {
          reason: "DERIVATION_EXECUTION",
          retryable: false,
          message: "old attempt",
        },
        maxAttempts: 2,
        initialBackoffMs: 100,
        maxBackoffMs: 1_000,
      },
    );
    expect(stale).toEqual({ status: "STALE" });

    const exhausted = await executeCommand(
      { db: db.client },
      recordRecallDerivationFailure,
      {
        stateId: reclaimed!.id,
        demandRevision: reclaimed!.demandRevision,
        executionEpoch: reclaimed!.executionEpoch,
        leaseToken: reclaimed!.leaseToken!,
        canonicalInputVersion: reclaimed!.canonicalInputVersion,
        blocker: {
          reason: "LANGUAGE_ANALYSIS",
          retryable: true,
          message: "still unavailable",
        },
        maxAttempts: 2,
        initialBackoffMs: 100,
        maxBackoffMs: 1_000,
      },
    );
    expect(exhausted).toEqual({ status: "FAILED", retryCount: 2 });
  });
});
