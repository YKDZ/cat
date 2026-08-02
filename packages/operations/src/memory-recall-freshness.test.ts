import {
  ensureLanguages,
  executeCommand,
  writeValidatedLanguageAnalysisSelection,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import {
  CanonicalInputVersionSchema,
  LanguageAnalysisWildcardSelectionKey,
  RecallDerivationVersionSchema,
  RecallDerivationReferenceSchema,
} from "@cat/shared";
import {
  recallDerivationState,
  memoryRecallVariant,
  eq,
  setupTestDB,
  TestPluginLoader,
  type TestDB,
} from "@cat/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { validateLanguageAnalyzerConfiguration } from "./language-analysis-requirement.ts";
import {
  assessRecallDerivationFreshness,
  processRecallDerivationBatch,
  startRecallDerivationWorker,
  waitForRecallDerivationFresh,
} from "./memory-recall-derivation.ts";

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
      await db.client.insert(recallDerivationState).values({
        targetKind: "MEMORY_ITEM",
        targetId: status === "BLOCKED" ? "1" : "2",
        languageId: "en",
        status,
        canonicalInputVersion: CanonicalInputVersionSchema.parse(
          `sha256:${"a".repeat(64)}`,
        ),
        blocker: {
          reason: "LANGUAGE_ANALYSIS",
          retryable: false,
          message: "configuration required",
        },
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
          blocker: {
            reason: "LANGUAGE_ANALYSIS",
            retryable: false,
            message: "configuration required",
          },
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
        status,
      });
    },
  );

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
