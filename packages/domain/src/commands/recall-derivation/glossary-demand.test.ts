import {
  and,
  eq,
  inArray,
  memoryRecallVariant,
  recallDerivationState,
  recallDerivationTaskDemand,
  sql,
  task,
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
  createProject,
  createUser,
  deleteGlossaryConcept,
  deleteGlossary,
  deleteGlossaryTerm,
  ensureLanguages,
  GlossaryProjectBindingError,
  materializeGlossaryConcept,
  publishTermRecallDerivation,
  reconcileRecallDerivationDemands,
  reconcileRecallDerivationDependency,
  projectRecallDerivationTasks,
  requestGlossaryRecallRebuild,
  reserveGlossaryEntityIds,
  linkProjectGlossaries,
  updateGlossaryConcept,
  updateGlossaryTerm,
} from "#/commands/index.ts";
import { executeCommand, executeQuery } from "#/executor.ts";
import { getGlossaryConceptMaterialization } from "#/queries/glossary/get-glossary-term-concept-snapshot.query.ts";
import { listTermConceptIdsByRecallVariants } from "#/queries/glossary/list-term-concept-ids-by-recall-variants.query.ts";
import { setupTestDB, type TestDB } from "#/testing/setup-test-db.ts";
import type { DbHandle } from "#/types.ts";

const DERIVATION_VERSION = RecallDerivationVersionSchema.parse(
  `sha256:${"d".repeat(64)}`,
);

type BoundedAwait = <T>(work: Promise<T>, label: string) => Promise<T>;
type ConcurrentCleanupClient = {
  pid: number;
  cleanup: () => Promise<void>;
};
type ConcurrentWorkSettlement = Promise<PromiseSettledResult<unknown>>;

const trackConcurrentWork = <T>(
  work: Promise<T>,
  settlements: ConcurrentWorkSettlement[],
): Promise<T> => {
  settlements.push(
    work.then<PromiseSettledResult<unknown>, PromiseSettledResult<unknown>>(
      (value) => ({ status: "fulfilled", value }),
      (reason: unknown) => ({ status: "rejected", reason }),
    ),
  );
  return work;
};

const appendError = (errors: unknown[], error: unknown): void => {
  if (error instanceof AggregateError) errors.push(...error.errors);
  else errors.push(error);
};

const throwCollectedErrors = (errors: unknown[], message: string): void => {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, message);
};

const runWithConcurrentCleanup = async <T>(options: {
  run: () => Promise<T>;
  release: () => void;
  clients: readonly ConcurrentCleanupClient[];
  settlements: readonly ConcurrentWorkSettlement[];
  terminateActive: (pids: readonly number[]) => Promise<void>;
  within: BoundedAwait;
}): Promise<T> => {
  let outcome: { ok: true; value: T } | { ok: false; error: unknown };
  try {
    outcome = { ok: true, value: await options.run() };
  } catch (error) {
    outcome = { ok: false, error };
  }
  options.release();

  const errors: unknown[] = [];
  if (!outcome.ok) appendError(errors, outcome.error);
  try {
    await options.within(
      options.terminateActive(options.clients.map(({ pid }) => pid)),
      "Concurrent backend termination",
    );
  } catch (error) {
    appendError(errors, error);
  }
  try {
    await options.within(
      Promise.all(options.settlements),
      "Concurrent database work settlement",
    );
  } catch (error) {
    appendError(errors, error);
  }
  const cleanupSettlements: ConcurrentWorkSettlement[] = [];
  for (const { pid, cleanup } of options.clients) {
    const boundedCleanup = options.within(
      Promise.resolve().then(cleanup),
      `Concurrent client cleanup for backend ${pid}`,
    );
    void trackConcurrentWork(boundedCleanup, cleanupSettlements);
  }
  const cleanupResults = await Promise.all(cleanupSettlements);
  for (const result of cleanupResults) {
    if (result.status === "rejected") appendError(errors, result.reason);
  }
  throwCollectedErrors(errors, "Concurrent database test cleanup failed");
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
};

describe("concurrent database test cleanup", () => {
  it("aggregates primary, per-client cleanup, and settlement failures", async () => {
    const primaryError = new Error("primary failure");
    const firstCleanupError = new Error("first cleanup failure");
    const secondCleanupTimeout = new Error("second cleanup timeout");
    const settlementTimeout = new Error("settlement timeout");
    const settlements: Promise<PromiseSettledResult<unknown>>[] = [];
    void trackConcurrentWork(new Promise<never>(() => undefined), settlements);
    let released = false;

    let thrown: unknown;
    try {
      await runWithConcurrentCleanup({
        run: async () => {
          throw primaryError;
        },
        release: () => {
          released = true;
        },
        clients: [
          {
            pid: 1,
            cleanup: async () => {
              throw firstCleanupError;
            },
          },
          {
            pid: 2,
            cleanup: async () => {
              await new Promise<never>(() => undefined);
            },
          },
        ],
        settlements,
        terminateActive: async () => undefined,
        within: async (work, label) => {
          if (label === "Concurrent client cleanup for backend 2") {
            throw secondCleanupTimeout;
          }
          if (label === "Concurrent database work settlement") {
            throw settlementTimeout;
          }
          return await work;
        },
      });
    } catch (error) {
      thrown = error;
    }

    expect(released).toBe(true);
    expect(thrown).toBeInstanceOf(AggregateError);
    if (!(thrown instanceof AggregateError)) throw thrown;
    expect(thrown.errors).toHaveLength(4);
    expect(thrown.errors).toEqual(
      expect.arrayContaining([
        primaryError,
        firstCleanupError,
        secondCleanupTimeout,
        settlementTimeout,
      ]),
    );
  });
});

describe("Glossary Recall Derivation demand", () => {
  let db: TestDB;
  let creatorId: string;
  let glossaryId: string;
  let projectId: string;

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
    const project = await executeCommand({ db: db.client }, createProject, {
      creatorId,
      description: null,
      name: "Recall rebuild project",
    });
    projectId = project.id;
    await executeCommand({ db: db.client }, linkProjectGlossaries, {
      glossaryIds: [glossaryId],
      projectId,
    });
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

  const within = async <T>(work: Promise<T>, label: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${label} timed out`)),
            5_000,
          );
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };

  const waitForReadiness = async (
    ready: Promise<void>,
    guardedWork: Promise<unknown>,
    label: string,
  ): Promise<void> => {
    await within(
      Promise.race([
        ready,
        guardedWork.then(
          () => {
            throw new Error(`${label} completed before becoming ready`);
          },
          (error: unknown) => {
            throw error;
          },
        ),
      ]),
      `${label} readiness`,
    );
  };

  const terminateActive = async (pids: readonly number[]): Promise<void> => {
    if (pids.length === 0) return;
    await db.client.execute(sql`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE pid IN (${sql.join(
        pids.map((pid) => sql`${pid}`),
        sql`, `,
      )}) AND state = 'active'
    `);
  };

  const backendPid = async (client: DbHandle) =>
    (
      await client.execute<{ pid: number }>(
        sql`SELECT pg_backend_pid()::integer AS pid`,
      )
    ).rows[0]!.pid;

  const waitForBlocker = async (
    waitingPid: number,
    blockerPid: number,
    label: string,
  ) => {
    const deadline = Date.now() + 5_000;
    while (true) {
      const result = await db.client.execute<{ blocked: boolean }>(sql`
        SELECT ${blockerPid} = ANY(pg_blocking_pids(${waitingPid})) AS blocked
      `);
      if (result.rows[0]?.blocked) return;
      if (Date.now() >= deadline) {
        throw new Error(`${label} did not reach its lock barrier`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };

  const waitForActiveQuery = async (
    pid: number,
    queryFragment: string,
  ): Promise<void> => {
    const deadline = Date.now() + 5_000;
    while (true) {
      const result = await db.client.execute<{ active: boolean }>(sql`
        SELECT EXISTS (
          SELECT 1
          FROM pg_stat_activity
          WHERE pid = ${pid}
            AND state = 'active'
            AND query LIKE ${`%${queryFragment}%`}
        ) AS active
      `);
      if (result.rows[0]?.active) return;
      if (Date.now() >= deadline) {
        throw new Error("Concurrent query did not become active");
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };

  const waitForBackendExit = async (pid: number): Promise<void> => {
    const deadline = Date.now() + 5_000;
    while (true) {
      const result = await db.client.execute<{ present: boolean }>(sql`
        SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE pid = ${pid}
        ) AS present
      `);
      if (!result.rows[0]?.present) return;
      if (Date.now() >= deadline) {
        throw new Error(`Backend ${pid} did not exit after termination`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };

  it("interrupts and settles active database work during bounded cleanup", async () => {
    const concurrentDb = await db.openConcurrentClient();
    const pid = await backendPid(concurrentDb.client);
    const settlements: ConcurrentWorkSettlement[] = [];
    const activeQuery = trackConcurrentWork(
      concurrentDb.client.execute(sql`SELECT pg_sleep(30)`),
      settlements,
    );

    await runWithConcurrentCleanup({
      run: async () => await waitForActiveQuery(pid, "pg_sleep(30)"),
      release: () => undefined,
      clients: [{ pid, cleanup: concurrentDb.cleanup }],
      settlements,
      terminateActive,
      within,
    });
    await expect(activeQuery).rejects.toThrow();
    await waitForBackendExit(pid);
  });

  it("returns NO_WORK for an empty glossary without creating a Task", async () => {
    const rebuilt = await executeCommand(
      { db: db.client },
      requestGlossaryRecallRebuild,
      { actorId: creatorId, glossaryId, projectId },
    );

    expect(rebuilt).toEqual({ status: "NO_WORK" });
    expect(await db.client.select({ id: task.id }).from(task)).toHaveLength(0);
  });

  it("rejects an unbound empty glossary before returning NO_WORK", async () => {
    const unbound = await executeCommand({ db: db.client }, createGlossary, {
      creatorId,
      name: `Unbound empty glossary ${crypto.randomUUID()}`,
    });

    await expect(
      executeCommand({ db: db.client }, requestGlossaryRecallRebuild, {
        actorId: creatorId,
        glossaryId: unbound.id,
        projectId,
      }),
    ).rejects.toBeInstanceOf(GlossaryProjectBindingError);
    expect(await db.client.select({ id: task.id }).from(task)).toHaveLength(0);
  });

  it("forces a new pending demand revision and distinct observer Task per request", async () => {
    await createConcept();

    const first = await executeCommand(
      { db: db.client },
      requestGlossaryRecallRebuild,
      { actorId: creatorId, glossaryId, projectId },
    );
    expect(first).toMatchObject({ status: "STARTED", total: 2 });
    if (first.status !== "STARTED") throw new Error("Expected rebuild task.");
    const afterFirst = await db.client
      .select()
      .from(recallDerivationState)
      .where(eq(recallDerivationState.targetKind, "TERM_CONCEPT"));
    expect(afterFirst).toHaveLength(2);
    expect(afterFirst).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blocker: null,
          demandRevision: 2,
          leaseOwnerId: null,
          leaseToken: null,
          requiredDerivationVersion: null,
          retryCount: 0,
          status: "PENDING",
        }),
      ]),
    );

    const second = await executeCommand(
      { db: db.client },
      requestGlossaryRecallRebuild,
      { actorId: creatorId, glossaryId, projectId },
    );
    expect(second).toMatchObject({ status: "STARTED", total: 2 });
    if (second.status !== "STARTED") throw new Error("Expected rebuild task.");
    expect(second.taskId).not.toBe(first.taskId);
    expect(
      await db.client
        .select({ id: task.id })
        .from(task)
        .where(eq(task.kind, "RECALL_DERIVATION")),
    ).toHaveLength(2);
    const afterSecond = await db.client
      .select({ demandRevision: recallDerivationState.demandRevision })
      .from(recallDerivationState)
      .where(eq(recallDerivationState.targetKind, "TERM_CONCEPT"));
    expect(afterSecond.every((state) => state.demandRevision === 3)).toBe(true);
  });

  it("keeps a rebuild Task attached while preparing its dependency version", async () => {
    await createConcept();
    const rebuilt = await executeCommand(
      { db: db.client },
      requestGlossaryRecallRebuild,
      { actorId: creatorId, glossaryId, projectId },
    );
    if (rebuilt.status !== "STARTED") throw new Error("Expected rebuild task.");

    await executeCommand(
      { db: db.client },
      reconcileRecallDerivationDependency,
      {
        targetKind: "TERM_CONCEPT",
        languageId: "en",
        requiredDerivationVersion: DERIVATION_VERSION,
      },
    );
    await executeCommand({ db: db.client }, projectRecallDerivationTasks, {
      taskIds: [rebuilt.taskId],
    });

    const [projected] = await db.client
      .select({ runtime: task.runtime, status: task.status })
      .from(task)
      .where(eq(task.id, rebuilt.taskId));
    expect(projected).toEqual({
      status: "PENDING",
      runtime: {
        kind: "RECALL_DERIVATION",
        phase: "QUEUED",
        result: null,
      },
    });
    const observations = await db.client
      .select({ supersededAt: recallDerivationTaskDemand.supersededAt })
      .from(recallDerivationTaskDemand)
      .where(eq(recallDerivationTaskDemand.taskId, rebuilt.taskId));
    expect(observations).toHaveLength(2);
    expect(observations.every((entry) => entry.supersededAt === null)).toBe(
      true,
    );
    const prepared = await db.client
      .select({ demandRevision: recallDerivationState.demandRevision })
      .from(recallDerivationState)
      .where(eq(recallDerivationState.languageId, "en"));
    expect(prepared).toEqual([{ demandRevision: 2 }]);
  });

  it("serializes concurrent rebuilds and fences the first observer Task", async () => {
    await createConcept();
    const [firstDb, secondDb] = await Promise.all([
      db.openConcurrentClient(),
      db.openConcurrentClient(),
    ]);
    const [firstPid, secondPid] = await Promise.all([
      backendPid(firstDb.client),
      backendPid(secondDb.client),
    ]);
    let releaseFirst = (): void => undefined;
    const firstRelease = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let markFirstPrepared = (): void => undefined;
    const firstPrepared = new Promise<void>((resolve) => {
      markFirstPrepared = resolve;
    });
    const settlements: ConcurrentWorkSettlement[] = [];
    const firstWork = trackConcurrentWork(
      firstDb.client.transaction(async (tx) => {
        const result = await executeCommand(
          { db: tx },
          requestGlossaryRecallRebuild,
          { actorId: creatorId, glossaryId, projectId },
        );
        markFirstPrepared();
        await firstRelease;
        return result;
      }),
      settlements,
    );
    const [first, second] = await runWithConcurrentCleanup({
      run: async () => {
        await waitForReadiness(
          firstPrepared,
          firstWork,
          "First glossary rebuild",
        );
        const secondWork = trackConcurrentWork(
          executeCommand(
            { db: secondDb.client },
            requestGlossaryRecallRebuild,
            { actorId: creatorId, glossaryId, projectId },
          ),
          settlements,
        );
        await waitForBlocker(secondPid, firstPid, "Second glossary rebuild");
        releaseFirst();
        return await within(
          Promise.all([firstWork, secondWork]),
          "Concurrent glossary rebuilds",
        );
      },
      release: releaseFirst,
      clients: [
        { pid: firstPid, cleanup: firstDb.cleanup },
        { pid: secondPid, cleanup: secondDb.cleanup },
      ],
      settlements,
      terminateActive,
      within,
    });
    if (first.status !== "STARTED" || second.status !== "STARTED") {
      throw new Error(
        "Expected both rebuild requests to create observer Tasks.",
      );
    }
    expect(first.taskId).not.toBe(second.taskId);
    await executeCommand({ db: db.client }, projectRecallDerivationTasks, {
      taskIds: [first.taskId, second.taskId],
    });
    const observations = await db.client
      .select({
        taskId: recallDerivationTaskDemand.taskId,
        supersededAt: recallDerivationTaskDemand.supersededAt,
      })
      .from(recallDerivationTaskDemand)
      .where(
        inArray(recallDerivationTaskDemand.taskId, [
          first.taskId,
          second.taskId,
        ]),
      );
    const firstObservations = observations.filter(
      (entry) => entry.taskId === first.taskId,
    );
    const secondObservations = observations.filter(
      (entry) => entry.taskId === second.taskId,
    );
    expect(firstObservations).toHaveLength(2);
    expect(secondObservations).toHaveLength(2);
    expect(
      firstObservations.every((entry) => entry.supersededAt !== null),
    ).toBe(true);
    expect(
      secondObservations.every((entry) => entry.supersededAt === null),
    ).toBe(true);
    const projectedTasks = await db.client
      .select({ id: task.id, status: task.status })
      .from(task)
      .where(inArray(task.id, [first.taskId, second.taskId]));
    expect(projectedTasks).toEqual(
      expect.arrayContaining([
        { id: first.taskId, status: "COMPLETED" },
        { id: second.taskId, status: "PENDING" },
      ]),
    );
    const supersededDemands = await db.client
      .select({
        demandRevision: recallDerivationTaskDemand.demandRevision,
        supersededAt: recallDerivationTaskDemand.supersededAt,
      })
      .from(recallDerivationTaskDemand)
      .where(eq(recallDerivationTaskDemand.taskId, first.taskId));
    expect(supersededDemands).toHaveLength(2);
    expect(
      supersededDemands.every((demand) => demand.supersededAt !== null),
    ).toBe(true);
    const current = await db.client
      .select({ demandRevision: recallDerivationState.demandRevision })
      .from(recallDerivationState)
      .where(eq(recallDerivationState.targetKind, "TERM_CONCEPT"));
    expect(current.every((state) => state.demandRevision === 3)).toBe(true);
  });

  it("rolls back forced state and Task creation with its outer transaction", async () => {
    await createConcept();
    const beforeStates = await db.client
      .select({
        demandRevision: recallDerivationState.demandRevision,
        status: recallDerivationState.status,
      })
      .from(recallDerivationState)
      .where(eq(recallDerivationState.targetKind, "TERM_CONCEPT"));
    const beforeTaskCount = await db.client.select({ id: task.id }).from(task);

    await expect(
      db.client.transaction(async (tx) => {
        await executeCommand({ db: tx }, requestGlossaryRecallRebuild, {
          actorId: creatorId,
          glossaryId,
          projectId,
        });
        throw new Error("force outer rollback");
      }),
    ).rejects.toThrow("force outer rollback");

    const afterStates = await db.client
      .select({
        demandRevision: recallDerivationState.demandRevision,
        status: recallDerivationState.status,
      })
      .from(recallDerivationState)
      .where(eq(recallDerivationState.targetKind, "TERM_CONCEPT"));
    const afterTaskCount = await db.client.select({ id: task.id }).from(task);
    expect(afterStates).toEqual(beforeStates);
    expect(afterTaskCount).toEqual(beforeTaskCount);
  });

  it("serializes rebuild with a canonical update without deadlocking", async () => {
    const created = await createConcept();
    const conceptId = created.conceptIds[0]!;
    const [holderDb, rebuildDb, updateDb] = await Promise.all([
      db.openConcurrentClient(),
      db.openConcurrentClient(),
      db.openConcurrentClient(),
    ]);
    let releaseHolder = (): void => undefined;
    const holderRelease = new Promise<void>((resolve) => {
      releaseHolder = resolve;
    });
    let holderReady = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      holderReady = resolve;
    });
    const [holderPid, rebuildPid, updatePid] = await Promise.all([
      backendPid(holderDb.client),
      backendPid(rebuildDb.client),
      backendPid(updateDb.client),
    ]);
    const settlements: ConcurrentWorkSettlement[] = [];
    const holder = trackConcurrentWork(
      holderDb.client.transaction(async (tx) => {
        await tx
          .select({ id: termConcept.id })
          .from(termConcept)
          .where(eq(termConcept.id, conceptId))
          .for("update");
        holderReady();
        await holderRelease;
      }),
      settlements,
    );
    await runWithConcurrentCleanup({
      run: async () => {
        await waitForReadiness(held, holder, "Canonical lock holder");
        const rebuild = trackConcurrentWork(
          executeCommand(
            { db: rebuildDb.client },
            requestGlossaryRecallRebuild,
            { actorId: creatorId, glossaryId, projectId },
          ),
          settlements,
        );
        await waitForBlocker(rebuildPid, holderPid, "Glossary rebuild");

        const update = trackConcurrentWork(
          executeCommand({ db: updateDb.client }, updateGlossaryTerm, {
            termId: created.termIds[0]!,
            text: "concurrent canonical update",
          }),
          settlements,
        );
        await waitForBlocker(updatePid, rebuildPid, "Canonical update");

        releaseHolder();
        await within(
          Promise.all([holder, rebuild, update]),
          "Canonical update serialization",
        );
      },
      release: releaseHolder,
      clients: [
        { pid: holderPid, cleanup: holderDb.cleanup },
        { pid: rebuildPid, cleanup: rebuildDb.cleanup },
        { pid: updatePid, cleanup: updateDb.cleanup },
      ],
      settlements,
      terminateActive,
      within,
    });
    const states = await db.client
      .select({
        canonicalInputVersion: recallDerivationState.canonicalInputVersion,
        demandRevision: recallDerivationState.demandRevision,
        languageId: recallDerivationState.languageId,
      })
      .from(recallDerivationState)
      .where(eq(recallDerivationState.targetKind, "TERM_CONCEPT"));
    expect(states).toHaveLength(2);
    expect(states).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ languageId: "en", demandRevision: 3 }),
        expect.objectContaining({ languageId: "fr", demandRevision: 2 }),
      ]),
    );
    expect(
      new Set(states.map((state) => state.canonicalInputVersion)).size,
    ).toBe(2);
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
