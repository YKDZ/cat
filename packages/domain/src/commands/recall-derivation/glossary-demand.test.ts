import {
  and,
  eq,
  memoryRecallVariant,
  recallDerivationState,
  sql,
  term,
  termConcept,
  termRecallVariant,
} from "@cat/db";
import {
  CanonicalInputVersionSchema,
  RecallDerivationVersionSchema,
} from "@cat/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  addGlossaryTermToConcept,
  claimRecallDerivationDemands,
  createGlossary,
  createGlossaryTerms,
  createUser,
  deleteGlossaryConcept,
  deleteGlossary,
  deleteGlossaryTerm,
  ensureLanguages,
  materializeGlossaryConcept,
  publishTermRecallDerivation,
  reconcileRecallDerivationDemands,
  reconcileRecallDerivationDependency,
  reserveGlossaryEntityIds,
  updateGlossaryConcept,
  updateGlossaryTerm,
} from "#/commands/index.ts";
import { executeCommand, executeQuery } from "#/executor.ts";
import { getGlossaryConceptMaterialization } from "#/queries/glossary/get-glossary-term-concept-snapshot.query.ts";
import { listTermConceptIdsByRecallVariants } from "#/queries/glossary/list-term-concept-ids-by-recall-variants.query.ts";
import { setupTestDB, type TestDB } from "#/testing/setup-test-db.ts";

const DERIVATION_VERSION = RecallDerivationVersionSchema.parse(
  `sha256:${"d".repeat(64)}`,
);

describe("Glossary Recall Derivation demand", () => {
  let db: TestDB;
  let creatorId: string;
  let glossaryId: string;

  beforeEach(async () => {
    db = await setupTestDB();
    await executeCommand({ db: db.client }, ensureLanguages, {
      languageIds: ["en", "fr", "ja"],
    });
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `glossary-demand-${crypto.randomUUID()}@example.com`,
      name: "Glossary demand owner",
    });
    creatorId = user.id;
    const glossary = await executeCommand({ db: db.client }, createGlossary, {
      creatorId,
      name: "Recall glossary",
    });
    glossaryId = glossary.id;
  });

  afterEach(async () => {
    await db?.cleanup();
  });

  const createConcept = async (translationLanguageId = "fr") =>
    await executeCommand({ db: db.client }, createGlossaryTerms, {
      glossaryId,
      creatorId,
      data: [
        {
          term: "Open file",
          termLanguageId: "en",
          translation: "Ouvrir le fichier",
          translationLanguageId,
          definition: `open-file-${crypto.randomUUID()}`,
        },
      ],
    });

  it("coalesces unchanged edits and tracks multi-language shape changes", async () => {
    const created = await createConcept();
    expect(created.derivations).toHaveLength(2);
    expect(created.derivations.map((entry) => entry.languageId).sort()).toEqual(
      ["en", "fr"],
    );
    const conceptId = created.conceptIds[0]!;

    const unchanged = await executeCommand(
      { db: db.client },
      updateGlossaryConcept,
      { conceptId },
    );
    expect(unchanged.derivations).toEqual([]);

    const changed = await executeCommand(
      { db: db.client },
      updateGlossaryConcept,
      { conceptId, definition: "Updated definition" },
    );
    expect(changed.derivations).toHaveLength(2);
    expect(
      changed.derivations.every((entry) => entry.demandRevision === 1),
    ).toBe(true);

    const japanese = await executeCommand(
      { db: db.client },
      addGlossaryTermToConcept,
      {
        conceptId,
        creatorId,
        languageId: "ja",
        text: "ファイルを開く",
        type: "NOT_SPECIFIED",
        status: "PREFERRED",
      },
    );
    expect(japanese.derivations).toHaveLength(3);
    expect(
      japanese.derivations.find((entry) => entry.languageId === "ja")
        ?.demandRevision,
    ).toBe(1);

    const removed = await executeCommand(
      { db: db.client },
      deleteGlossaryTerm,
      { termId: japanese.termId },
    );
    expect(removed.derivations.map((entry) => entry.languageId).sort()).toEqual(
      ["en", "fr", "ja"],
    );
    const japaneseStates = await db.client
      .select()
      .from(recallDerivationState)
      .where(
        and(
          eq(recallDerivationState.targetKind, "TERM_CONCEPT"),
          eq(recallDerivationState.targetId, String(conceptId)),
          eq(recallDerivationState.languageId, "ja"),
        ),
      );
    expect(japaneseStates).toHaveLength(1);
    expect(japaneseStates[0]?.status).toBe("PENDING");
    expect(japaneseStates[0]?.demandRevision).toBe(2);
  });

  it("normalizes expected aggregate ordering but rejects a semantic OCC mismatch", async () => {
    const created = await createConcept();
    const conceptId = created.conceptIds[0]!;
    const snapshot = await executeQuery(
      { db: db.client },
      getGlossaryConceptMaterialization,
      { conceptId },
    );
    if (snapshot === null) throw new Error("Expected materialized concept.");
    await expect(
      executeCommand({ db: db.client }, materializeGlossaryConcept, {
        ...snapshot,
        expectedBefore: {
          ...snapshot,
          terms: [...snapshot.terms].reverse(),
          subjects: [...snapshot.subjects].reverse(),
        },
      }),
    ).resolves.toMatchObject({ conceptId });
    await expect(
      executeCommand({ db: db.client }, materializeGlossaryConcept, {
        ...snapshot,
        expectedBefore: {
          ...snapshot,
          concept: { ...snapshot.concept, definition: "stale definition" },
        },
      }),
    ).rejects.toThrow("optimistic concurrency conflict");
  });

  it("fences stale publishers and atomically replaces a generation", async () => {
    const created = await createConcept("en");
    const conceptId = created.conceptIds[0]!;
    const [firstClaim] = await executeCommand(
      { db: db.client },
      claimRecallDerivationDemands,
      { leaseDurationMs: 60_000, limit: 1, workerId: crypto.randomUUID() },
    );
    expect(firstClaim?.targetKind).toBe("TERM_CONCEPT");
    const first = await executeCommand(
      { db: db.client },
      publishTermRecallDerivation,
      {
        targetId: firstClaim!.targetId,
        conceptId,
        languageId: firstClaim!.languageId,
        demandRevision: firstClaim!.demandRevision,
        executionEpoch: firstClaim!.executionEpoch,
        leaseToken: firstClaim!.leaseToken!,
        canonicalInputVersion: firstClaim!.canonicalInputVersion,
        recallDerivationVersion: DERIVATION_VERSION,
        variants: [
          {
            text: "Open file",
            normalizedText: "open file",
            variantType: "CASE_FOLDED",
            meta: { sourceTermId: created.termIds[0]! },
          },
        ],
      },
    );
    expect(first.status).toBe("PUBLISHED");
    expect(
      await executeQuery(
        { db: db.client },
        listTermConceptIdsByRecallVariants,
        {
          glossaryIds: [glossaryId],
          normalizedText: "open file",
          sourceLanguageId: "en",
          requiredDerivationVersion: DERIVATION_VERSION,
          minSimilarity: 0.8,
          maxAmount: 10,
        },
      ),
    ).toEqual([conceptId]);

    await executeCommand({ db: db.client }, updateGlossaryTerm, {
      termId: created.termIds[0]!,
      text: "Open document",
    });
    expect(
      await executeQuery(
        { db: db.client },
        listTermConceptIdsByRecallVariants,
        {
          glossaryIds: [glossaryId],
          normalizedText: "open file",
          sourceLanguageId: "en",
          requiredDerivationVersion: DERIVATION_VERSION,
          minSimilarity: 0.8,
          maxAmount: 10,
        },
      ),
    ).toEqual([]);
    const stale = await executeCommand(
      { db: db.client },
      publishTermRecallDerivation,
      {
        targetId: firstClaim!.targetId,
        conceptId,
        languageId: firstClaim!.languageId,
        demandRevision: firstClaim!.demandRevision,
        executionEpoch: firstClaim!.executionEpoch,
        leaseToken: firstClaim!.leaseToken!,
        canonicalInputVersion: firstClaim!.canonicalInputVersion,
        recallDerivationVersion: DERIVATION_VERSION,
        variants: [],
      },
    );
    expect(stale.status).toBe("STALE");

    const [nextClaim] = await executeCommand(
      { db: db.client },
      claimRecallDerivationDemands,
      { leaseDurationMs: 60_000, limit: 1, workerId: crypto.randomUUID() },
    );
    const next = await executeCommand(
      { db: db.client },
      publishTermRecallDerivation,
      {
        targetId: nextClaim!.targetId,
        conceptId,
        languageId: nextClaim!.languageId,
        demandRevision: nextClaim!.demandRevision,
        executionEpoch: nextClaim!.executionEpoch,
        leaseToken: nextClaim!.leaseToken!,
        canonicalInputVersion: nextClaim!.canonicalInputVersion,
        recallDerivationVersion: DERIVATION_VERSION,
        variants: [
          {
            text: "Open document",
            normalizedText: "open document",
            variantType: "CASE_FOLDED",
            meta: { sourceTermId: created.termIds[0]! },
          },
          {
            text: "Open",
            normalizedText: "open",
            variantType: "LEMMA",
            meta: { sourceTermId: created.termIds[0]!, windowSize: 2 },
          },
        ],
      },
    );
    expect(next.status).toBe("PUBLISHED");
    const variants = await db.client
      .select({ normalizedText: termRecallVariant.normalizedText })
      .from(termRecallVariant)
      .where(eq(termRecallVariant.conceptId, conceptId));
    expect(variants.map((entry) => entry.normalizedText).sort()).toEqual([
      "open",
      "open document",
    ]);
  });

  it("serializes concurrent writes to the same concept before demand coalescing", async () => {
    const created = await createConcept("en");
    const concurrent = await db.openConcurrentClient();
    try {
      const writes = await Promise.all([
        executeCommand({ db: db.client }, updateGlossaryTerm, {
          termId: created.termIds[0]!,
          text: "Open first",
        }),
        executeCommand({ db: concurrent.client }, updateGlossaryTerm, {
          termId: created.termIds[0]!,
          text: "Open second",
        }),
      ]);
      expect(
        writes
          .map((write) => write.derivations[0]!.demandRevision)
          .sort((left, right) => left - right),
      ).toEqual([2, 3]);
      const [state] = await db.client
        .select()
        .from(recallDerivationState)
        .where(
          and(
            eq(recallDerivationState.targetKind, "TERM_CONCEPT"),
            eq(recallDerivationState.targetId, String(created.conceptIds[0])),
            eq(recallDerivationState.languageId, "en"),
          ),
        );
      expect(state?.status).toBe("PENDING");
      expect(state?.demandRevision).toBe(3);
    } finally {
      await concurrent.cleanup();
    }
  });

  it("publishes a concept deletion tombstone and reclaims an interrupted lease", async () => {
    const created = await createConcept("en");
    const conceptId = created.conceptIds[0]!;
    const deleted = await executeCommand(
      { db: db.client },
      deleteGlossaryConcept,
      { conceptId },
    );
    expect(deleted.derivations).toHaveLength(1);
    const [claim] = await executeCommand(
      { db: db.client },
      claimRecallDerivationDemands,
      { leaseDurationMs: 60_000, limit: 1, workerId: crypto.randomUUID() },
    );
    await db.client
      .update(recallDerivationState)
      .set({ leaseExpiresAt: new Date(0) })
      .where(eq(recallDerivationState.id, claim!.id));
    expect(
      (
        await executeCommand(
          { db: db.client },
          reconcileRecallDerivationDemands,
          {},
        )
      ).expiredLeaseCount,
    ).toBe(1);
    const [reclaimed] = await executeCommand(
      { db: db.client },
      claimRecallDerivationDemands,
      { leaseDurationMs: 60_000, limit: 1, workerId: crypto.randomUUID() },
    );
    const published = await executeCommand(
      { db: db.client },
      publishTermRecallDerivation,
      {
        targetId: reclaimed!.targetId,
        conceptId: null,
        languageId: reclaimed!.languageId,
        demandRevision: reclaimed!.demandRevision,
        executionEpoch: reclaimed!.executionEpoch,
        leaseToken: reclaimed!.leaseToken!,
        canonicalInputVersion: reclaimed!.canonicalInputVersion,
        recallDerivationVersion: DERIVATION_VERSION,
        variants: [],
      },
    );
    expect(published.status).toBe("PUBLISHED");
    expect(await db.client.select().from(termRecallVariant)).toEqual([]);
  });

  it("invalidates only the selected adapter on dependency version change", async () => {
    const created = await createConcept("en");
    const memoryCanonical = CanonicalInputVersionSchema.parse(
      `sha256:${"a".repeat(64)}`,
    );
    await db.client.insert(recallDerivationState).values({
      targetKind: "MEMORY_ITEM",
      targetId: "999",
      languageId: "en",
      canonicalInputVersion: memoryCanonical,
    });
    const nextVersion = RecallDerivationVersionSchema.parse(
      `sha256:${"e".repeat(64)}`,
    );
    await executeCommand(
      { db: db.client },
      reconcileRecallDerivationDependency,
      {
        targetKind: "TERM_CONCEPT",
        languageId: "en",
        requiredDerivationVersion: nextVersion,
      },
    );
    const states = await db.client
      .select({
        targetKind: recallDerivationState.targetKind,
        requiredDerivationVersion:
          recallDerivationState.requiredDerivationVersion,
      })
      .from(recallDerivationState);
    expect(
      states.find((entry) => entry.targetKind === "TERM_CONCEPT")
        ?.requiredDerivationVersion,
    ).toBe(nextVersion);
    expect(
      states.find((entry) => entry.targetKind === "MEMORY_ITEM")
        ?.requiredDerivationVersion,
    ).toBeNull();
    expect(created.derivations).toHaveLength(1);
    expect(await db.client.select().from(memoryRecallVariant)).toEqual([]);
  });

  it("hides a published generation immediately when its required version changes", async () => {
    const created = await createConcept("en");
    const conceptId = created.conceptIds[0]!;
    const [claim] = await executeCommand(
      { db: db.client },
      claimRecallDerivationDemands,
      { leaseDurationMs: 60_000, limit: 1, workerId: crypto.randomUUID() },
    );
    await executeCommand({ db: db.client }, publishTermRecallDerivation, {
      targetId: claim!.targetId,
      conceptId,
      languageId: claim!.languageId,
      demandRevision: claim!.demandRevision,
      executionEpoch: claim!.executionEpoch,
      leaseToken: claim!.leaseToken!,
      canonicalInputVersion: claim!.canonicalInputVersion,
      recallDerivationVersion: DERIVATION_VERSION,
      variants: [
        {
          text: "Open file",
          normalizedText: "open file",
          variantType: "CASE_FOLDED",
          meta: { sourceTermId: created.termIds[0]! },
        },
      ],
    });
    await expect(
      executeQuery({ db: db.client }, listTermConceptIdsByRecallVariants, {
        glossaryIds: [glossaryId],
        normalizedText: "open file",
        sourceLanguageId: "en",
        requiredDerivationVersion: DERIVATION_VERSION,
        minSimilarity: 0.8,
        maxAmount: 10,
      }),
    ).resolves.toEqual([conceptId]);

    const nextVersion = RecallDerivationVersionSchema.parse(
      `sha256:${"f".repeat(64)}`,
    );
    await executeCommand(
      { db: db.client },
      reconcileRecallDerivationDependency,
      {
        targetKind: "TERM_CONCEPT",
        languageId: "en",
        requiredDerivationVersion: nextVersion,
      },
    );

    for (const requiredDerivationVersion of [DERIVATION_VERSION, nextVersion]) {
      await expect(
        executeQuery({ db: db.client }, listTermConceptIdsByRecallVariants, {
          glossaryIds: [glossaryId],
          normalizedText: "open file",
          sourceLanguageId: "en",
          requiredDerivationVersion,
          minSimilarity: 0.8,
          maxAmount: 10,
        }),
      ).resolves.toEqual([]);
    }
    expect(
      await db.client
        .select({ id: termRecallVariant.id })
        .from(termRecallVariant)
        .where(eq(termRecallVariant.conceptId, conceptId)),
    ).toHaveLength(1);
  });

  it("publishes each term variant generation atomically to concurrent observers", async () => {
    const created = await createConcept("en");
    const conceptId = created.conceptIds[0]!;
    const [firstClaim] = await executeCommand(
      { db: db.client },
      claimRecallDerivationDemands,
      { leaseDurationMs: 60_000, limit: 1, workerId: crypto.randomUUID() },
    );
    await executeCommand({ db: db.client }, publishTermRecallDerivation, {
      targetId: firstClaim!.targetId,
      conceptId,
      languageId: firstClaim!.languageId,
      demandRevision: firstClaim!.demandRevision,
      executionEpoch: firstClaim!.executionEpoch,
      leaseToken: firstClaim!.leaseToken!,
      canonicalInputVersion: firstClaim!.canonicalInputVersion,
      recallDerivationVersion: DERIVATION_VERSION,
      variants: ["old-a", "old-b"].map((normalizedText) => ({
        text: normalizedText,
        normalizedText,
        variantType: "LEMMA" as const,
        meta: { sourceTermId: created.termIds[0]! },
      })),
    });
    await executeCommand({ db: db.client }, updateGlossaryTerm, {
      termId: created.termIds[0]!,
      text: "Open document",
    });
    const [nextClaim] = await executeCommand(
      { db: db.client },
      claimRecallDerivationDemands,
      { leaseDurationMs: 60_000, limit: 1, workerId: crypto.randomUUID() },
    );
    const nextVariants = Array.from({ length: 400 }, (_, index) => ({
      text: `new-${index}`,
      normalizedText: `new-${index}`,
      variantType: "LEMMA" as const,
      meta: { sourceTermId: created.termIds[0]! },
    }));
    const observer = await db.openConcurrentClient();
    try {
      const readCount = async () => {
        const counted = await observer.client
          .select({ value: sql<number>`count(*)::integer` })
          .from(termRecallVariant)
          .where(eq(termRecallVariant.conceptId, conceptId));
        return counted[0]!.value;
      };
      const observed = [await readCount()];
      let completed = false;
      const publication = executeCommand(
        { db: db.client },
        publishTermRecallDerivation,
        {
          targetId: nextClaim!.targetId,
          conceptId,
          languageId: nextClaim!.languageId,
          demandRevision: nextClaim!.demandRevision,
          executionEpoch: nextClaim!.executionEpoch,
          leaseToken: nextClaim!.leaseToken!,
          canonicalInputVersion: nextClaim!.canonicalInputVersion,
          recallDerivationVersion: DERIVATION_VERSION,
          variants: nextVariants,
        },
      ).finally(() => {
        completed = true;
      });
      while (!completed) {
        observed.push(await readCount());
      }
      expect((await publication).status).toBe("PUBLISHED");
      observed.push(await readCount());
      expect(new Set(observed)).toEqual(new Set([2, nextVariants.length]));
    } finally {
      await observer.cleanup();
    }
  });

  it("converts a Glossary cascade delete into durable concept tombstones", async () => {
    const first = await createConcept();
    const second = await createConcept("ja");
    const deleted = await executeCommand({ db: db.client }, deleteGlossary, {
      glossaryId,
    });
    expect(deleted.deleted).toBe(true);
    expect(deleted.conceptIds.sort((left, right) => left - right)).toEqual(
      [...first.conceptIds, ...second.conceptIds].sort(
        (left, right) => left - right,
      ),
    );
    expect(deleted.derivations).toHaveLength(4);
    expect(await db.client.select().from(termConcept)).toEqual([]);
    const states = await db.client
      .select()
      .from(recallDerivationState)
      .where(eq(recallDerivationState.targetKind, "TERM_CONCEPT"));
    expect(states).toHaveLength(4);
    expect(states.every((state) => state.status === "PENDING")).toBe(true);
  });

  it("serializes aggregate deletion and exact materialization without deadlock", async () => {
    const reserved = await executeCommand(
      { db: db.client },
      reserveGlossaryEntityIds,
      {
        conceptCount: 1,
        termCount: 1,
      },
    );
    const conceptId = reserved.conceptIds[0]!;
    const termId = reserved.termIds[0]!;
    const snapshot = {
      concept: {
        id: conceptId,
        glossaryId,
        creatorId,
        definition: "Reserved concurrent concept",
      },
      terms: [
        {
          id: termId,
          termConceptId: conceptId,
          creatorId,
          text: "Reserved concurrent term",
          languageId: "en",
          type: "NOT_SPECIFIED" as const,
          status: "PREFERRED" as const,
        },
      ],
      subjects: [],
    };
    const [materializeDb, deleteDb, barrierDb] = await Promise.all([
      db.openConcurrentClient(),
      db.openConcurrentClient(),
      db.openConcurrentClient(),
    ]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let releaseBarrier = () => {};
    try {
      const materializeBackend = await materializeDb.client.execute<{
        pid: number;
      }>(sql`SELECT pg_backend_pid()::integer AS pid`);
      const deleteBackend = await deleteDb.client.execute<{ pid: number }>(
        sql`SELECT pg_backend_pid()::integer AS pid`,
      );
      const materializePid = materializeBackend.rows[0]!.pid;
      const deletePid = deleteBackend.rows[0]!.pid;
      let markBarrierReady = () => {};
      const barrierReady = new Promise<void>((resolve) => {
        markBarrierReady = resolve;
      });
      const barrierRelease = new Promise<void>((resolve) => {
        releaseBarrier = resolve;
      });
      const barrier = barrierDb.client.transaction(async (tx) => {
        await tx.execute(
          sql`LOCK TABLE ${termConcept}, ${term} IN SHARE ROW EXCLUSIVE MODE`,
        );
        markBarrierReady();
        await barrierRelease;
      });
      await barrierReady;

      const waitForLock = async (pid: number, label: string) => {
        const deadline = Date.now() + 5_000;
        while (true) {
          const activity = await db.client.execute<{ waiting: boolean }>(sql`
            SELECT wait_event_type = 'Lock' AS waiting
            FROM pg_stat_activity
            WHERE pid = ${pid}
          `);
          if (activity.rows[0]?.waiting) return;
          if (Date.now() >= deadline) {
            throw new Error(`${label} did not reach the lock barrier`);
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      };
      const materialization = executeCommand(
        { db: materializeDb.client },
        materializeGlossaryConcept,
        snapshot,
      );
      await waitForLock(materializePid, "Glossary materialization");
      const deletion = executeCommand({ db: deleteDb.client }, deleteGlossary, {
        glossaryId,
      });
      await waitForLock(deletePid, "Glossary deletion");
      releaseBarrier();
      const results = await Promise.race([
        Promise.allSettled([materialization, deletion]),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("concurrent Glossary writes timed out")),
            10_000,
          );
        }),
      ]);
      await barrier;
      expect(results.map((result) => result.status)).toEqual([
        "fulfilled",
        "fulfilled",
      ]);
    } finally {
      clearTimeout(timer);
      releaseBarrier();
      await Promise.all([
        materializeDb.cleanup(),
        deleteDb.cleanup(),
        barrierDb.cleanup(),
      ]);
    }
    expect(await db.client.select().from(termConcept)).toEqual([]);
  });
});
