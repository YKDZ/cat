import {
  and,
  eq,
  memoryRecallVariant,
  recallDerivationState,
  recallDerivationTaskDemand,
  sql,
} from "@cat/db";
import {
  CanonicalInputVersionSchema,
  LanguageAnalysisSelectionFingerprintSchema,
  LanguageAnalysisWildcardSelectionKey,
  RecallDerivationReferenceSchema,
  RecallDerivationVersionSchema,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  claimRecallDerivationDemands,
  createRecallDerivationTask,
  createElements,
  createMemory,
  createMemoryItems,
  createProject,
  createRootContentNode,
  createTranslations,
  createUser,
  createVectorizedStrings,
  ensureCoreRelationTypes,
  ensureLanguages,
  publishMemoryRecallDerivation,
  projectRecallDerivationTasks,
  writeValidatedLanguageAnalysisSelection,
} from "#/commands/index.ts";
import { executeCommand, executeQuery } from "#/executor.ts";
import { listVariantMemorySuggestions } from "#/queries/memory/list-variant-memory-suggestions.query.ts";
import { getRecallDerivationStates } from "#/queries/recall-derivation/get-recall-derivation-states.query.ts";
import { setupTestDB, type TestDB } from "#/testing/setup-test-db.ts";
import type { DbHandle } from "#/types.ts";

describe("Memory Recall Derivation demand", () => {
  let db: TestDB;

  beforeEach(async () => {
    db = await setupTestDB();
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it("commits canonical Memory Items with coalesced language demands", async () => {
    await executeCommand({ db: db.client }, ensureLanguages, {
      languageIds: ["en", "zh-Hans"],
    });
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `memory-demand-${crypto.randomUUID()}@example.com`,
      name: "Memory demand owner",
    });
    const memory = await executeCommand({ db: db.client }, createMemory, {
      creatorId: user.id,
      name: "Demand memory",
    });
    const [sourceStringId, translationStringId] = await executeCommand(
      { db: db.client },
      createVectorizedStrings,
      {
        data: [
          { text: "Press Enter", languageId: "en" },
          { text: "按回车键", languageId: "zh-Hans" },
        ],
      },
    );

    const input = {
      memoryId: memory.id,
      items: [
        {
          translationId: null,
          translationStringId: translationStringId!,
          sourceStringId: sourceStringId!,
          creatorId: user.id,
        },
      ],
    };
    const created = await executeCommand(
      { db: db.client },
      createMemoryItems,
      input,
    );
    expect(created.items).toHaveLength(1);
    expect(created.derivations).toHaveLength(2);

    const states = await executeQuery(
      { db: db.client },
      getRecallDerivationStates,
      { references: created.derivations },
    );
    expect(states).toHaveLength(2);
    expect(states.map((state) => state.languageId).sort()).toEqual([
      "en",
      "zh-Hans",
    ]);
    expect(states.every((state) => state.status === "PENDING")).toBe(true);
    expect(states.every((state) => state.demandRevision === 1)).toBe(true);
    expect(
      states.every((state) =>
        /^sha256:[a-f0-9]{64}$/.test(state.canonicalInputVersion),
      ),
    ).toBe(true);
  });

  it("projects overlapping Task batches without lock-order deadlock", async () => {
    await executeCommand({ db: db.client }, ensureLanguages, {
      languageIds: ["en"],
    });
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `projection-lock-${crypto.randomUUID()}@example.com`,
      name: "Projection lock owner",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      creatorId: user.id,
      description: null,
      name: "Projection lock project",
    });
    await db.client.insert(recallDerivationState).values({
      targetKind: "MEMORY_ITEM",
      targetId: "700",
      languageId: "en",
      canonicalInputVersion: CanonicalInputVersionSchema.parse(
        `sha256:${"7".repeat(64)}`,
      ),
    });
    const reference = RecallDerivationReferenceSchema.parse({
      targetKind: "MEMORY_ITEM",
      targetId: "700",
      languageId: "en",
      demandRevision: 1,
    });
    const createTask = async () =>
      await executeCommand({ db: db.client }, createRecallDerivationTask, {
        references: [reference],
        scope: { type: "PROJECT", id: project.id },
        actor: { type: "USER", id: user.id },
        resources: [{ type: "PROJECT", id: project.id }],
      });
    const [taskA, taskB] = await Promise.all([createTask(), createTask()]);
    const orderedTasks = [taskA, taskB].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    const firstTask = orderedTasks[0]!;
    const secondTask = orderedTasks[1]!;
    const [holderDb, batchDb, singleDb] = await Promise.all([
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
    const [holderPid, batchPid, singlePid] = await Promise.all([
      backendPid(holderDb.client),
      backendPid(batchDb.client),
      backendPid(singleDb.client),
    ]);
    const holder = holderDb.client.transaction(async (tx) => {
      await tx
        .select({ id: recallDerivationState.id })
        .from(recallDerivationState)
        .for("update");
      holderReady();
      await holderRelease;
    });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await held;
      const batch = executeCommand(
        { db: batchDb.client },
        projectRecallDerivationTasks,
        { taskIds: [firstTask.id, secondTask.id] },
      );
      await waitForBlocker(batchPid, holderPid, "[A, B] projection");

      const single = executeCommand(
        { db: singleDb.client },
        projectRecallDerivationTasks,
        { taskIds: [secondTask.id] },
      );
      await waitForBlocker(singlePid, batchPid, "[B] projection");

      releaseHolder();
      const [first, second] = await Promise.race([
        Promise.all([batch, single]),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error("projection lock timeout")),
            5_000,
          );
        }),
      ]);
      await holder;
      expect(first).toHaveLength(2);
      expect(second).toHaveLength(1);
      expect(first.every((summary) => summary.state.revision >= 0)).toBe(true);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      releaseHolder();
      await Promise.allSettled([holder]);
      await Promise.all([
        holderDb.cleanup(),
        batchDb.cleanup(),
        singleDb.cleanup(),
      ]);
    }
  });

  it("removes obsolete language states when an upsert changes language shape", async () => {
    await executeCommand({ db: db.client }, ensureLanguages, {
      languageIds: ["en", "fr", "ja", "zh-Hans"],
    });
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `memory-language-shape-${crypto.randomUUID()}@example.com`,
      name: "Memory language shape owner",
    });
    const memory = await executeCommand({ db: db.client }, createMemory, {
      creatorId: user.id,
      name: "Language shape memory",
    });
    const [enSource, enTranslation, frSource, frTranslation, jaSource] =
      await executeCommand({ db: db.client }, createVectorizedStrings, {
        data: [
          { text: "Open", languageId: "en" },
          { text: "Close", languageId: "en" },
          { text: "Ouvrir", languageId: "fr" },
          { text: "Fermer", languageId: "fr" },
          { text: "開く", languageId: "ja" },
        ],
      });
    const write = async (
      sourceStringId: number,
      translationStringId: number,
      memoryItemId?: number,
    ) =>
      await executeCommand({ db: db.client }, createMemoryItems, {
        memoryId: memory.id,
        items: [
          {
            ...(memoryItemId === undefined ? {} : { memoryItemId }),
            creatorId: user.id,
            sourceStringId,
            translationId: null,
            translationStringId,
          },
        ],
      });
    const readLanguages = async (memoryItemId: number) =>
      (
        await db.client
          .select({ languageId: recallDerivationState.languageId })
          .from(recallDerivationState)
          .where(eq(recallDerivationState.targetId, String(memoryItemId)))
      )
        .map((row) => row.languageId)
        .sort();

    const same = await write(enSource!, enTranslation!);
    const memoryItemId = same.items[0]!.id;
    expect(await readLanguages(memoryItemId)).toEqual(["en"]);

    const bilingual = await write(enSource!, frTranslation!, memoryItemId);
    expect(await readLanguages(memoryItemId)).toEqual(["en", "fr"]);
    const [englishState] = await db.client
      .select()
      .from(recallDerivationState)
      .where(
        and(
          eq(recallDerivationState.targetId, String(memoryItemId)),
          eq(recallDerivationState.languageId, "en"),
        ),
      );
    const version = RecallDerivationVersionSchema.parse(
      `sha256:${"7".repeat(64)}`,
    );
    await db.client
      .update(recallDerivationState)
      .set({
        status: "FRESH",
        requiredDerivationVersion: version,
        currentCanonicalInputVersion: englishState!.canonicalInputVersion,
        currentDerivationVersion: version,
      })
      .where(eq(recallDerivationState.id, englishState!.id));

    const project = await executeCommand({ db: db.client }, createProject, {
      creatorId: user.id,
      description: null,
      name: "Task snapshot project",
    });
    const task = await executeCommand(
      { db: db.client },
      createRecallDerivationTask,
      {
        references: bilingual.derivations,
        scope: { type: "PROJECT", id: project.id },
        actor: { type: "USER", id: user.id },
        resources: [{ type: "PROJECT", id: project.id }],
      },
    );

    await write(frSource!, frTranslation!, memoryItemId);
    expect(await readLanguages(memoryItemId)).toEqual(["fr"]);
    const demands = await db.client
      .select()
      .from(recallDerivationTaskDemand)
      .where(eq(recallDerivationTaskDemand.taskId, task.id));
    expect(demands).toHaveLength(2);
    expect(
      demands.some(
        (demand) =>
          demand.languageId === "en" && demand.derivationStateId === null,
      ),
    ).toBe(true);
    const [settled] = await executeCommand(
      { db: db.client },
      projectRecallDerivationTasks,
      { taskIds: [task.id] },
    );
    expect(settled?.state).toMatchObject({
      status: "COMPLETED",
      progressCurrent: 2,
      progressTotal: 2,
    });

    await write(jaSource!, frTranslation!, memoryItemId);
    expect(await readLanguages(memoryItemId)).toEqual(["fr", "ja"]);
  });

  it("coalesces unchanged writes and increments revision for canonical changes", async () => {
    await executeCommand({ db: db.client }, ensureCoreRelationTypes, {});
    await executeCommand({ db: db.client }, ensureLanguages, {
      languageIds: ["en", "zh-Hans"],
    });
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `memory-coalesce-${crypto.randomUUID()}@example.com`,
      name: "Memory coalesce owner",
    });
    const project = await executeCommand({ db: db.client }, createProject, {
      creatorId: user.id,
      description: null,
      name: "Memory coalesce project",
    });
    const root = await executeCommand(
      { db: db.client },
      createRootContentNode,
      { creatorId: user.id, projectId: project.id },
    );
    const [sourceStringId, firstTranslationStringId, nextTranslationStringId] =
      await executeCommand({ db: db.client }, createVectorizedStrings, {
        data: [
          { text: "Open inventory", languageId: "en" },
          { text: "打开物品栏", languageId: "zh-Hans" },
          { text: "开启物品栏", languageId: "zh-Hans" },
        ],
      });
    const [elementId] = await executeCommand(
      { db: db.client },
      createElements,
      {
        data: [
          {
            creatorId: user.id,
            importerId: "memory-demand-test",
            primaryContentNodeId: root.id,
            projectId: project.id,
            sourceNodeRef: "memory-demand:open-inventory",
            sourceRootRef: `project:${project.id}`,
            stableSourceRef: "memory-demand:open-inventory",
            stringId: sourceStringId!,
          },
        ],
      },
    );
    const [translationId] = await executeCommand(
      { db: db.client },
      createTranslations,
      {
        data: [
          {
            stringId: firstTranslationStringId!,
            translatableElementId: elementId!,
            translatorId: user.id,
          },
        ],
      },
    );
    const memory = await executeCommand({ db: db.client }, createMemory, {
      creatorId: user.id,
      name: "Coalesced memory",
    });
    const write = async (translationStringId: number) =>
      await executeCommand({ db: db.client }, createMemoryItems, {
        memoryId: memory.id,
        items: [
          {
            creatorId: user.id,
            sourceStringId: sourceStringId!,
            translationId: translationId!,
            translationStringId,
          },
        ],
      });

    const created = await write(firstTranslationStringId!);
    const unchanged = await write(firstTranslationStringId!);
    const changed = await write(nextTranslationStringId!);

    expect(unchanged.items).toEqual(created.items);
    expect(unchanged.derivations).toEqual(created.derivations);
    expect(changed.items[0]?.id).toBe(created.items[0]?.id);
    expect(changed.derivations.every((item) => item.demandRevision === 2)).toBe(
      true,
    );
    const states = await executeQuery(
      { db: db.client },
      getRecallDerivationStates,
      { references: changed.derivations },
    );
    expect(states.every((state) => state.status === "PENDING")).toBe(true);
    expect(states.every((state) => state.demandRevision === 2)).toBe(true);

    const workerId = crypto.randomUUID();
    const claims = await executeCommand(
      { db: db.client },
      claimRecallDerivationDemands,
      { leaseDurationMs: 60_000, limit: 10, workerId },
    );
    const englishClaim = claims.find((claim) => claim.languageId === "en")!;
    const derivationVersion = RecallDerivationVersionSchema.parse(
      `sha256:${"d".repeat(64)}`,
    );
    const published = await executeCommand(
      { db: db.client },
      publishMemoryRecallDerivation,
      {
        targetId: englishClaim.targetId,
        memoryId: memory.id,
        languageId: englishClaim.languageId,
        demandRevision: englishClaim.demandRevision,
        executionEpoch: englishClaim.executionEpoch,
        leaseToken: englishClaim.leaseToken!,
        canonicalInputVersion: CanonicalInputVersionSchema.parse(
          englishClaim.canonicalInputVersion,
        ),
        recallDerivationVersion: derivationVersion,
        variants: [
          {
            querySide: "SOURCE",
            text: "Open inventory",
            normalizedText: "open inventory",
            variantType: "CASE_FOLDED",
            meta: null,
          },
        ],
      },
    );
    expect(published.status).toBe("PUBLISHED");

    const implementation = ServiceImplementationReferenceSchema.parse({
      pluginId: "memory-demand-analyzer",
      serviceId: "analyzer",
      serviceType: "LANGUAGE_ANALYZER",
      scopeType: "GLOBAL",
      scopeId: "",
    });
    const configurationFingerprint =
      LanguageAnalysisSelectionFingerprintSchema.parse(
        `sha256:${"e".repeat(64)}`,
      );
    await executeCommand(
      { db: db.client },
      writeValidatedLanguageAnalysisSelection,
      {
        key: LanguageAnalysisWildcardSelectionKey,
        implementation,
        configurationFingerprint,
        expectedRevision: 0,
      },
    );
    const invalidated = await executeQuery(
      { db: db.client },
      getRecallDerivationStates,
      { references: changed.derivations },
    );
    expect(invalidated.every((state) => state.status === "PENDING")).toBe(true);
    expect(invalidated.every((state) => state.demandRevision === 3)).toBe(true);

    await executeCommand(
      { db: db.client },
      writeValidatedLanguageAnalysisSelection,
      {
        key: LanguageAnalysisWildcardSelectionKey,
        implementation,
        configurationFingerprint,
        expectedRevision: 1,
      },
    );
    const unchangedDependency = await executeQuery(
      { db: db.client },
      getRecallDerivationStates,
      { references: changed.derivations },
    );
    expect(
      unchangedDependency.every((state) => state.demandRevision === 3),
    ).toBe(true);

    await write(firstTranslationStringId!);
    const stale = await executeCommand(
      { db: db.client },
      publishMemoryRecallDerivation,
      {
        targetId: englishClaim.targetId,
        memoryId: memory.id,
        languageId: englishClaim.languageId,
        demandRevision: englishClaim.demandRevision,
        executionEpoch: englishClaim.executionEpoch,
        leaseToken: englishClaim.leaseToken!,
        canonicalInputVersion: CanonicalInputVersionSchema.parse(
          englishClaim.canonicalInputVersion,
        ),
        recallDerivationVersion: derivationVersion,
        variants: [
          {
            querySide: "SOURCE",
            text: "stale",
            normalizedText: "stale",
            variantType: "SURFACE",
            meta: null,
          },
        ],
      },
    );
    expect(stale).toEqual({ status: "STALE" });
    const persisted = await db.client
      .select({ text: memoryRecallVariant.text })
      .from(memoryRecallVariant)
      .where(
        and(
          eq(memoryRecallVariant.memoryItemId, created.items[0]!.id),
          eq(memoryRecallVariant.languageId, "en"),
        ),
      );
    expect(persisted).toEqual([{ text: "Open inventory" }]);
    const staleSuggestions = await executeQuery(
      { db: db.client },
      listVariantMemorySuggestions,
      {
        text: "Open inventory",
        normalizedText: "open inventory",
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
        memoryIds: [memory.id],
        requiredDerivationVersion: derivationVersion,
        minSimilarity: 0.7,
        maxAmount: 10,
      },
    );
    expect(staleSuggestions).toEqual([]);
  });

  it("publishes both query sides in one generation for same-language items", async () => {
    await executeCommand({ db: db.client }, ensureLanguages, {
      languageIds: ["en"],
    });
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `memory-same-language-${crypto.randomUUID()}@example.com`,
      name: "Same language owner",
    });
    const memory = await executeCommand({ db: db.client }, createMemory, {
      creatorId: user.id,
      name: "Same language memory",
    });
    const [sourceStringId, translationStringId] = await executeCommand(
      { db: db.client },
      createVectorizedStrings,
      {
        data: [
          { text: "Color", languageId: "en" },
          { text: "Colour", languageId: "en" },
        ],
      },
    );
    const created = await executeCommand({ db: db.client }, createMemoryItems, {
      memoryId: memory.id,
      items: [
        {
          translationId: null,
          translationStringId: translationStringId!,
          sourceStringId: sourceStringId!,
          creatorId: user.id,
        },
      ],
    });
    expect(created.derivations).toHaveLength(1);
    const [claim] = await executeCommand(
      { db: db.client },
      claimRecallDerivationDemands,
      {
        workerId: crypto.randomUUID(),
        limit: 1,
        leaseDurationMs: 60_000,
      },
    );
    const version = RecallDerivationVersionSchema.parse(
      `sha256:${"f".repeat(64)}`,
    );
    const published = await executeCommand(
      { db: db.client },
      publishMemoryRecallDerivation,
      {
        targetId: claim!.targetId,
        memoryId: memory.id,
        languageId: claim!.languageId,
        demandRevision: claim!.demandRevision,
        executionEpoch: claim!.executionEpoch,
        leaseToken: claim!.leaseToken!,
        canonicalInputVersion: claim!.canonicalInputVersion,
        recallDerivationVersion: version,
        variants: [
          {
            querySide: "SOURCE",
            text: "Color",
            normalizedText: "color",
            variantType: "CASE_FOLDED",
            meta: null,
          },
          {
            querySide: "TRANSLATION",
            text: "Colour",
            normalizedText: "colour",
            variantType: "CASE_FOLDED",
            meta: null,
          },
        ],
      },
    );
    expect(published.status).toBe("PUBLISHED");
    const rows = await db.client
      .select({
        derivationStateId: memoryRecallVariant.derivationStateId,
        querySide: memoryRecallVariant.querySide,
        canonicalInputVersion: memoryRecallVariant.canonicalInputVersion,
        recallDerivationVersion: memoryRecallVariant.recallDerivationVersion,
      })
      .from(memoryRecallVariant)
      .where(eq(memoryRecallVariant.memoryItemId, created.items[0]!.id));
    expect(rows.map((row) => row.querySide).sort()).toEqual([
      "SOURCE",
      "TRANSLATION",
    ]);
    expect(new Set(rows.map((row) => row.derivationStateId)).size).toBe(1);
    expect(
      rows.every(
        (row) =>
          row.canonicalInputVersion === claim!.canonicalInputVersion &&
          row.recallDerivationVersion === version,
      ),
    ).toBe(true);
  });
});
