import {
  createUser,
  ensureLanguages,
  executeCommand,
  writeValidatedLanguageAnalysisSelection,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { serverLogger } from "@cat/server-shared";
import {
  CanonicalInputVersionSchema,
  LanguageAnalysisWildcardSelectionKey,
  RecallDerivationVersionSchema,
  RecallDerivationReferenceSchema,
} from "@cat/shared";
import {
  recallDerivationState,
  memoryRecallVariant,
  task as taskTable,
  eq,
  or,
  setupTestDB,
  TestPluginLoader,
  type TestDB,
} from "@cat/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { validateLanguageAnalyzerConfiguration } from "./language-analysis-requirement.ts";
import {
  assessRecallDerivationFreshness,
  processRecallDerivationBatch,
  RecallDerivationFreshnessError,
  startRecallDerivationWorker,
  waitForRecallDerivationFresh,
} from "./memory-recall-derivation.ts";
import { startRecallDerivationTask } from "./recall-derivation-task.ts";

describe("Recall Derivation freshness", () => {
  let db: TestDB;
  let pluginManager: PluginManager;

  beforeEach(async () => {
    db = await setupTestDB();
    const loader = new TestPluginLoader({ includeLanguageAnalyzer: true });
    pluginManager = PluginManager.get("GLOBAL", "", loader);
    await pluginManager.getDiscovery().syncDefinitions(db.client);
    await pluginManager.install(db.client, "mock-language-analyzer");
    await db.client.transaction(async (tx) => {
      await pluginManager.restore(tx);
    });
    await executeCommand({ db: db.client }, ensureLanguages, {
      languageIds: ["en", "fr"],
    });
    const analyzer = pluginManager.getServices("LANGUAGE_ANALYZER")[0]!;
    const implementation =
      pluginManager.createServiceImplementationReference(analyzer);
    const validated = await validateLanguageAnalyzerConfiguration(
      implementation,
      { traceId: "recall-freshness-selection", pluginManager },
    );
    await executeCommand(
      { db: db.client },
      writeValidatedLanguageAnalysisSelection,
      {
        key: LanguageAnalysisWildcardSelectionKey,
        implementation,
        configurationFingerprint: validated.fingerprint,
        expectedRevision: 0,
      },
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    PluginManager.clear();
    await db.cleanup();
  });

  const reference = (targetId: string, demandRevision = 1) =>
    RecallDerivationReferenceSchema.parse({
      targetKind: "MEMORY_ITEM",
      targetId,
      languageId: "en",
      demandRevision,
    });

  const termReference = (targetId: string, languageId: string) =>
    RecallDerivationReferenceSchema.parse({
      targetKind: "TERM_CONCEPT",
      targetId,
      languageId,
      demandRevision: 1,
    });

  it.each(["BLOCKED", "FAILED"] as const)(
    "propagates %s without polling",
    async (status) => {
      const blocker = {
        reason: "DERIVATION_EXECUTION" as const,
        retryable: false,
        message: "derivation requires repair",
      };
      await db.client.insert(recallDerivationState).values({
        targetKind: "MEMORY_ITEM",
        targetId: status === "BLOCKED" ? "1" : "2",
        languageId: "en",
        status,
        canonicalInputVersion: CanonicalInputVersionSchema.parse(
          `sha256:${"a".repeat(64)}`,
        ),
        blocker,
      });
      const refs = [reference(status === "BLOCKED" ? "1" : "2")];
      const recovered = await assessRecallDerivationFreshness(refs, {
        db: db.client,
        pluginManager,
      });
      expect(recovered.status).toBe("PENDING");
      await db.client
        .update(recallDerivationState)
        .set({
          status,
          blocker,
        })
        .where(
          eq(recallDerivationState.targetId, status === "BLOCKED" ? "1" : "2"),
        );
      const assessment = await assessRecallDerivationFreshness(refs, {
        db: db.client,
        pluginManager,
      });
      expect(assessment.status).toBe(status);
      await expect(
        waitForRecallDerivationFresh(refs, {
          db: db.client,
          pluginManager,
          timeoutMs: 10_000,
        }),
      ).rejects.toMatchObject({
        blockers: [blocker],
        message: `Recall Derivation freshness wait ended with ${status}. Blockers: DERIVATION_EXECUTION: derivation requires repair`,
        status,
      });
    },
  );

  it("deduplicates identical blocker diagnostics", () => {
    const blocker = {
      reason: "LANGUAGE_ANALYSIS" as const,
      retryable: true,
      message: "Language Analysis requirement is BLOCKED.",
    };
    const error = new RecallDerivationFreshnessError(
      "BLOCKED",
      [],
      [blocker, blocker],
    );

    expect(error.message).toBe(
      "Recall Derivation freshness wait ended with BLOCKED. Blockers: LANGUAGE_ANALYSIS: Language Analysis requirement is BLOCKED.",
    );
  });

  it("times out pending work and propagates AbortSignal cancellation", async () => {
    await db.client.insert(recallDerivationState).values({
      targetKind: "MEMORY_ITEM",
      targetId: "3",
      languageId: "en",
      canonicalInputVersion: CanonicalInputVersionSchema.parse(
        `sha256:${"b".repeat(64)}`,
      ),
    });
    const refs = [reference("3")];
    await expect(
      waitForRecallDerivationFresh(refs, {
        db: db.client,
        pluginManager,
        timeoutMs: 0,
      }),
    ).rejects.toMatchObject({
      status: "TIMEOUT",
    });

    const controller = new AbortController();
    const reason = new Error("test shutdown");
    controller.abort(reason);
    await expect(
      waitForRecallDerivationFresh(refs, {
        db: db.client,
        pluginManager,
        signal: controller.signal,
      }),
    ).rejects.toBe(reason);
  });

  it("accepts a superseding revision only when its current versions are fresh", async () => {
    const canonicalInputVersion = CanonicalInputVersionSchema.parse(
      `sha256:${"c".repeat(64)}`,
    );
    const recallDerivationVersion = RecallDerivationVersionSchema.parse(
      `sha256:${"d".repeat(64)}`,
    );
    await db.client.insert(recallDerivationState).values({
      targetKind: "MEMORY_ITEM",
      targetId: "4",
      languageId: "en",
      status: "FRESH",
      demandRevision: 2,
      canonicalInputVersion,
      requiredDerivationVersion: recallDerivationVersion,
      currentCanonicalInputVersion: canonicalInputVersion,
      currentDerivationVersion: recallDerivationVersion,
    });
    const refs = [reference("4", 1)];
    await expect(
      waitForRecallDerivationFresh(refs, {
        db: db.client,
        pluginManager,
        timeoutMs: 5_000,
      }),
    ).resolves.toBeUndefined();
  });

  it("stops idempotently after draining and releasing owned leases", async () => {
    const workerId = crypto.randomUUID();
    await db.client.insert(recallDerivationState).values({
      targetKind: "MEMORY_ITEM",
      targetId: "5",
      languageId: "en",
      status: "RUNNING",
      executionEpoch: 1,
      leaseOwnerId: workerId,
      leaseToken: crypto.randomUUID(),
      leaseExpiresAt: new Date(Date.now() + 60_000),
      canonicalInputVersion: CanonicalInputVersionSchema.parse(
        `sha256:${"e".repeat(64)}`,
      ),
    });
    const worker = await startRecallDerivationWorker({
      db: db.client,
      pluginManager,
      workerId,
      pollIntervalMs: 60_000,
    });
    await worker.stop();
    await worker.stop();
    const [state] = await db.client
      .select()
      .from(recallDerivationState)
      .where(eq(recallDerivationState.targetId, "5"));
    expect(state).toMatchObject({
      status: "PENDING",
      leaseOwnerId: null,
      leaseToken: null,
      leaseExpiresAt: null,
    });
  });

  it("reclaims an expired RUNNING lease while waiting for freshness", async () => {
    await db.client.insert(recallDerivationState).values({
      targetKind: "MEMORY_ITEM",
      targetId: "6",
      languageId: "en",
      status: "RUNNING",
      executionEpoch: 1,
      leaseOwnerId: crypto.randomUUID(),
      leaseToken: crypto.randomUUID(),
      leaseExpiresAt: new Date(Date.now() - 1_000),
      canonicalInputVersion: CanonicalInputVersionSchema.parse(
        `sha256:${"6".repeat(64)}`,
      ),
    });
    await expect(
      waitForRecallDerivationFresh([reference("6")], {
        db: db.client,
        pluginManager,
        timeoutMs: 5_000,
      }),
    ).resolves.toBeUndefined();
    const [state] = await db.client
      .select()
      .from(recallDerivationState)
      .where(eq(recallDerivationState.targetId, "6"));
    expect(state).toMatchObject({
      status: "FRESH",
      leaseOwnerId: null,
      leaseToken: null,
      leaseExpiresAt: null,
    });
  });

  it("publishes a deleted Memory tombstone as a fresh empty generation", async () => {
    await db.client.insert(recallDerivationState).values({
      targetKind: "MEMORY_ITEM",
      targetId: "999999",
      languageId: "en",
      canonicalInputVersion: CanonicalInputVersionSchema.parse(
        `sha256:${"f".repeat(64)}`,
      ),
    });
    const processed = await processRecallDerivationBatch({
      db: db.client,
      pluginManager,
      limit: 1,
    });
    expect(processed).toMatchObject({ claimed: 1, published: 1 });
    const [state] = await db.client
      .select()
      .from(recallDerivationState)
      .where(eq(recallDerivationState.targetId, "999999"));
    const variants = await db.client
      .select({ id: memoryRecallVariant.id })
      .from(memoryRecallVariant)
      .where(eq(memoryRecallVariant.memoryItemId, 999_999));
    expect(state).toMatchObject({
      status: "FRESH",
      leaseToken: null,
      currentCanonicalInputVersion: state?.canonicalInputVersion,
      currentDerivationVersion: state?.requiredDerivationVersion,
    });
    expect(variants).toEqual([]);
  });

  it("publishes one coalesced demand once and settles each observing Task", async () => {
    await db.client.insert(recallDerivationState).values({
      targetKind: "MEMORY_ITEM",
      targetId: "1001",
      languageId: "en",
      canonicalInputVersion: CanonicalInputVersionSchema.parse(
        `sha256:${"2".repeat(64)}`,
      ),
    });
    const actor = await executeCommand({ db: db.client }, createUser, {
      email: `${crypto.randomUUID()}@example.com`,
      name: "Coalesced Recall observer",
    });
    const input = {
      projectId: "11111111-1111-4111-8111-111111111111",
      actorId: actor.id,
      references: [reference("1001")],
    };
    const [first, second] = await Promise.all([
      startRecallDerivationTask(db.client, input),
      startRecallDerivationTask(db.client, input),
    ]);
    const processed = await processRecallDerivationBatch({
      db: db.client,
      pluginManager,
      limit: 2,
    });
    expect(processed).toEqual({
      claimed: 1,
      published: 1,
      stale: 0,
      failed: 0,
    });
    const tasks = await db.client
      .select({
        id: taskTable.id,
        status: taskTable.status,
        progressCurrent: taskTable.progressCurrent,
        progressTotal: taskTable.progressTotal,
      })
      .from(taskTable)
      .where(or(eq(taskTable.id, first.id), eq(taskTable.id, second.id)));
    expect(tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: first.id,
          status: "COMPLETED",
          progressCurrent: 1,
          progressTotal: 1,
        }),
        expect.objectContaining({
          id: second.id,
          status: "COMPLETED",
          progressCurrent: 1,
          progressTotal: 1,
        }),
      ]),
    );
  });

  it("does not let reconciliation discovery failure alter worker counters and recovers next batch", async () => {
    await db.client.insert(recallDerivationState).values({
      targetKind: "MEMORY_ITEM",
      targetId: "1000",
      languageId: "en",
      canonicalInputVersion: CanonicalInputVersionSchema.parse(
        `sha256:${"1".repeat(64)}`,
      ),
    });
    const actor = await executeCommand({ db: db.client }, createUser, {
      email: `${crypto.randomUUID()}@example.com`,
      name: "Recall projection observer",
    });
    const task = await startRecallDerivationTask(db.client, {
      projectId: "11111111-1111-4111-8111-111111111111",
      actorId: actor.id,
      references: [reference("1000")],
    });
    const discovery = vi
      .spyOn(db.client, "selectDistinct")
      .mockImplementationOnce(() => {
        throw new Error("injected reconciliation discovery failure");
      });
    const logError = vi
      .spyOn(serverLogger, "error")
      .mockImplementation(() => undefined);
    const first = await processRecallDerivationBatch({
      db: db.client,
      pluginManager,
      limit: 1,
    });
    expect(first).toMatchObject({
      claimed: 1,
      published: 1,
      stale: 0,
      failed: 0,
    });
    expect(logError).toHaveBeenCalledWith(
      "Recall derivation Task projection reconciliation discovery failed",
      expect.objectContaining({ error: expect.any(Error) }),
    );
    discovery.mockRestore();
    const second = await processRecallDerivationBatch({
      db: db.client,
      pluginManager,
      limit: 1,
    });
    expect(second).toEqual({ claimed: 0, published: 0, stale: 0, failed: 0 });
    const [projected] = await db.client
      .select({ status: taskTable.status })
      .from(taskTable)
      .where(eq(taskTable.id, task.id));
    expect(projected?.status).toBe("COMPLETED");
  });

  it("projects dependency and wait failures to only their affected references", async () => {
    const canonicalInputVersion = CanonicalInputVersionSchema.parse(
      `sha256:${"7".repeat(64)}`,
    );
    const references = [
      reference("7"),
      termReference("8", "en"),
      termReference("9", "fr"),
    ];
    await db.client.insert(recallDerivationState).values(
      references.map((entry) => ({
        targetKind: entry.targetKind,
        targetId: entry.targetId,
        languageId: entry.languageId,
        canonicalInputVersion,
      })),
    );

    const assessment = await assessRecallDerivationFreshness(references, {
      db: db.client,
      pluginManager,
    });
    expect(assessment).toMatchObject({
      status: "BLOCKED",
      references: [termReference("9", "fr")],
    });
    await expect(
      waitForRecallDerivationFresh(references, {
        db: db.client,
        pluginManager,
        timeoutMs: 5_000,
      }),
    ).rejects.toMatchObject({
      status: "BLOCKED",
      references: [termReference("9", "fr")],
    });
  });

  it("prioritizes a tokenizer failure over a concurrent analyzer blocker", async () => {
    const canonicalInputVersion = CanonicalInputVersionSchema.parse(
      `sha256:${"9".repeat(64)}`,
    );
    const references = [reference("12"), termReference("13", "fr")];
    await db.client.insert(recallDerivationState).values(
      references.map((entry) => ({
        targetKind: entry.targetKind,
        targetId: entry.targetId,
        languageId: entry.languageId,
        canonicalInputVersion,
      })),
    );
    vi.spyOn(pluginManager, "captureServiceRuntimeSnapshots").mockRejectedValue(
      new Error("tokenizer snapshot failed"),
    );

    const assessment = await assessRecallDerivationFreshness(references, {
      db: db.client,
      pluginManager,
    });

    expect(assessment).toMatchObject({
      status: "FAILED",
      references,
    });
    expect(
      assessment.status === "FAILED"
        ? new Set(assessment.blockers.map((blocker) => blocker.reason))
        : null,
    ).toEqual(new Set(["TOKENIZER", "LANGUAGE_ANALYSIS"]));
  });

  it("continues the healthy adapter when another target kind is blocked", async () => {
    const canonicalInputVersion = CanonicalInputVersionSchema.parse(
      `sha256:${"8".repeat(64)}`,
    );
    await db.client.insert(recallDerivationState).values([
      {
        targetKind: "MEMORY_ITEM",
        targetId: "10",
        languageId: "en",
        canonicalInputVersion,
      },
      {
        targetKind: "TERM_CONCEPT",
        targetId: "11",
        languageId: "fr",
        canonicalInputVersion,
      },
    ]);

    const processed = await processRecallDerivationBatch({
      db: db.client,
      pluginManager,
      limit: 2,
    });
    expect(processed).toMatchObject({
      claimed: 2,
      published: 1,
      failed: 1,
    });
    const states = await db.client.select().from(recallDerivationState);
    expect(
      states.find((entry) => entry.targetKind === "MEMORY_ITEM"),
    ).toMatchObject({ status: "FRESH" });
    expect(
      states.find((entry) => entry.targetKind === "TERM_CONCEPT"),
    ).toMatchObject({
      status: "BLOCKED",
      blocker: { reason: "LANGUAGE_ANALYSIS" },
    });
  });
});
