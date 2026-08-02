import {
  addChangesetEntry,
  createBranch,
  createChangeset,
  createElements,
  createMemory,
  createMemoryItems,
  createProject,
  createRootContentNode,
  createUser,
  createVectorizedStrings,
  ensureCoreRelationTypes,
  ensureLanguages,
  ensurePersonalProjectMemory,
  executeCommand,
  executeQuery,
  getChangeset,
  getChangesetEntries,
  getMemoryCanonicalSnapshots,
  getRecallDerivationStates,
  listTranslationsByElement,
} from "@cat/domain";
import { assertFirstNonNullish, NormalizedLanguageIdSchema } from "@cat/shared";
import type { TestDB } from "@cat/test-utils";
import {
  eq,
  memoryItem,
  recallDerivationState,
  setupTestDB,
} from "@cat/test-utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mergeBranch, rebaseBranch } from "./branch-merge.ts";
import {
  ChangeSetApplicationError,
  ChangeSetService,
} from "./changeset-service.ts";
import { getDefaultRegistries } from "./index.ts";
import { MemoryItemApplicationMethod } from "./methods/memory-item-application-method.ts";

let testDb: TestDB;
const enLanguageId = NormalizedLanguageIdSchema.parse("en");
const zhHansLanguageId = NormalizedLanguageIdSchema.parse("zh-Hans");

beforeAll(async () => {
  testDb = await setupTestDB();
});

afterAll(async () => {
  await testDb?.cleanup();
});

const seedTranslationTarget = async (): Promise<{
  elementId: number;
  projectId: string;
  userId: string;
}> => {
  await executeCommand({ db: testDb.client }, ensureCoreRelationTypes, {});
  await executeCommand({ db: testDb.client }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });
  const user = await executeCommand({ db: testDb.client }, createUser, {
    email: `vcs-changeset-${crypto.randomUUID()}@test.local`,
    name: "VCS changeset tester",
  });
  const project = await executeCommand({ db: testDb.client }, createProject, {
    name: "VCS changeset test project",
    description: null,
    creatorId: user.id,
  });
  const root = await executeCommand(
    { db: testDb.client },
    createRootContentNode,
    { projectId: project.id, creatorId: user.id },
  );
  const stringIds = await executeCommand(
    { db: testDb.client },
    createVectorizedStrings,
    { data: [{ text: "Source", languageId: "en" }] },
  );
  const elementIds = await executeCommand(
    { db: testDb.client },
    createElements,
    {
      data: [
        {
          projectId: project.id,
          primaryContentNodeId: root.id,
          importerId: "vcs-test",
          sourceRootRef: `project:${project.id}`,
          sourceNodeRef: "vcs-test#0",
          stableSourceRef: `vcs-test#${crypto.randomUUID()}`,
          stringId: assertFirstNonNullish(stringIds),
          creatorId: user.id,
        },
      ],
    },
  );
  return {
    elementId: assertFirstNonNullish(elementIds),
    projectId: project.id,
    userId: user.id,
  };
};

const createService = (): ChangeSetService => {
  const { diffRegistry, appMethodRegistry } = getDefaultRegistries();
  return new ChangeSetService(testDb.client, diffRegistry, appMethodRegistry);
};

describe("ChangeSetService database application", () => {
  it("persists FAILED state and leaves an invalid changeset unapplied", async () => {
    const { projectId } = await seedTranslationTarget();
    const changeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId, status: "APPROVED" },
    );
    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: changeset.id,
      entityType: "translation",
      entityId: `translation:${crypto.randomUUID()}`,
      action: "CREATE",
      after: { text: "missing identity fields" },
      riskLevel: "LOW",
    });

    await expect(
      createService().applyChangeSet(changeset.id, { projectId }),
    ).rejects.toBeInstanceOf(ChangeSetApplicationError);

    await expect(
      executeQuery({ db: testDb.client }, getChangeset, {
        changesetId: changeset.id,
      }),
    ).resolves.toMatchObject({ status: "APPROVED", asyncStatus: "HAS_FAILED" });
    await expect(
      executeQuery({ db: testDb.client }, getChangesetEntries, {
        changesetId: changeset.id,
      }),
    ).resolves.toEqual([expect.objectContaining({ asyncStatus: "FAILED" })]);
  });

  it("materializes one translation when the same CREATE is retried", async () => {
    const { elementId, projectId, userId } = await seedTranslationTarget();
    const changeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId, status: "APPROVED" },
    );
    const entityId = `translation:${crypto.randomUUID()}`;
    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: changeset.id,
      entityType: "translation",
      entityId,
      action: "CREATE",
      after: {
        translatableElementId: elementId,
        languageId: "zh-Hans",
        text: "Retry-safe translation",
        translatorId: userId,
      },
      riskLevel: "LOW",
    });

    const service = createService();
    await service.applyChangeSet(changeset.id, { projectId });
    await service.applyChangeSet(changeset.id, { projectId });

    await expect(
      executeQuery({ db: testDb.client }, listTranslationsByElement, {
        elementId,
        languageId: "zh-Hans",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        text: "Retry-safe translation",
        meta: { __catVcsEntityId: entityId },
      }),
    ]);
  });

  it("rejects cross-project Memory Item application and fetch access", async () => {
    await executeCommand({ db: testDb.client }, ensureLanguages, {
      languageIds: ["en", "zh-Hans"],
    });
    const user = await executeCommand({ db: testDb.client }, createUser, {
      email: `vcs-memory-scope-${crypto.randomUUID()}@test.local`,
      name: "VCS memory scope tester",
    });
    const ownerProject = await executeCommand(
      { db: testDb.client },
      createProject,
      { name: "Owner project", description: null, creatorId: user.id },
    );
    const otherProject = await executeCommand(
      { db: testDb.client },
      createProject,
      { name: "Other project", description: null, creatorId: user.id },
    );
    const memory = await executeCommand({ db: testDb.client }, createMemory, {
      name: "Scoped VCS memory",
      creatorId: user.id,
      projectIds: [ownerProject.id],
    });
    const [sourceStringId, translationStringId] = await executeCommand(
      { db: testDb.client },
      createVectorizedStrings,
      {
        data: [
          { text: "Scoped source", languageId: "en" },
          { text: "Scoped target", languageId: "zh-Hans" },
        ],
      },
    );
    if (sourceStringId === undefined || translationStringId === undefined) {
      throw new Error("Expected scoped Memory Item strings.");
    }
    const original = (
      await executeCommand({ db: testDb.client }, createMemoryItems, {
        memoryId: memory.id,
        items: [
          {
            translationId: null,
            sourceStringId,
            translationStringId,
            creatorId: user.id,
          },
        ],
      })
    ).items[0]!;
    const payload = {
      memoryItemId: original.id,
      memoryId: memory.id,
      translationId: null,
      sourceStringId,
      translationStringId,
      creatorId: user.id,
    };
    const applicationEntry = (
      action: "CREATE" | "UPDATE" | "DELETE",
      entityId = String(original.id),
    ) => ({
      id: 1,
      changesetId: 1,
      entityType: "memory_item",
      entityId,
      action,
      before: {
        ...payload,
        scope: "PROJECT" as const,
        projectId: otherProject.id,
        deletedById: user.id,
      },
      after: payload,
      fieldPath: null,
      riskLevel: "MEDIUM" as const,
      reviewStatus: "APPROVED" as const,
      asyncStatus: null,
    });
    const readRows = async () =>
      await testDb.client
        .select()
        .from(memoryItem)
        .where(eq(memoryItem.id, original.id));
    const readDemands = async () =>
      await testDb.client
        .select()
        .from(recallDerivationState)
        .where(eq(recallDerivationState.targetId, String(original.id)));
    const rowsBefore = await readRows();
    const demandsBefore = await readDemands();
    const method = new MemoryItemApplicationMethod();
    const ctx = { projectId: otherProject.id, db: testDb.client };

    await expect(
      method.applyCreate(applicationEntry("CREATE"), ctx),
    ).resolves.toMatchObject({ status: "FAILED" });
    await expect(
      method.applyUpdate(applicationEntry("UPDATE"), ctx),
    ).resolves.toMatchObject({ status: "FAILED" });
    await expect(
      method.applyDelete(applicationEntry("DELETE"), ctx),
    ).resolves.toMatchObject({ status: "FAILED" });
    await expect(
      method.fetchCurrentStates([String(original.id)], ctx),
    ).resolves.toEqual(new Map());
    await expect(readRows()).resolves.toEqual(rowsBefore);
    await expect(readDemands()).resolves.toEqual(demandsBefore);
  });

  it("rejects same-project PERSONAL Memory Item application without an actor", async () => {
    await executeCommand({ db: testDb.client }, ensureLanguages, {
      languageIds: ["en", "zh-Hans"],
    });
    const user = await executeCommand({ db: testDb.client }, createUser, {
      email: `vcs-personal-scope-${crypto.randomUUID()}@test.local`,
      name: "VCS personal scope tester",
    });
    const project = await executeCommand({ db: testDb.client }, createProject, {
      name: "Personal scope project",
      description: null,
      creatorId: user.id,
    });
    const personal = await executeCommand(
      { db: testDb.client },
      ensurePersonalProjectMemory,
      { userId: user.id, projectId: project.id, name: "Personal VCS memory" },
    );
    const [sourceStringId, translationStringId] = await executeCommand(
      { db: testDb.client },
      createVectorizedStrings,
      {
        data: [
          { text: "Personal scoped source", languageId: "en" },
          { text: "Personal scoped target", languageId: "zh-Hans" },
        ],
      },
    );
    if (sourceStringId === undefined || translationStringId === undefined) {
      throw new Error("Expected personal Memory Item strings.");
    }
    const original = (
      await executeCommand({ db: testDb.client }, createMemoryItems, {
        memoryId: personal.memoryId,
        items: [
          {
            translationId: null,
            sourceStringId,
            translationStringId,
            creatorId: user.id,
          },
        ],
      })
    ).items[0]!;
    const payload = {
      memoryItemId: original.id,
      memoryId: personal.memoryId,
      translationId: null,
      sourceStringId,
      translationStringId,
      creatorId: user.id,
    };
    const applicationEntry = (action: "CREATE" | "UPDATE" | "DELETE") => ({
      id: 1,
      changesetId: 1,
      entityType: "memory_item",
      entityId: String(original.id),
      action,
      before: {
        ...payload,
        scope: "PERSONAL" as const,
        projectId: project.id,
        deletedById: user.id,
      },
      after: payload,
      fieldPath: null,
      riskLevel: "MEDIUM" as const,
      reviewStatus: "APPROVED" as const,
      asyncStatus: null,
    });
    const readRows = async () =>
      await testDb.client
        .select()
        .from(memoryItem)
        .where(eq(memoryItem.id, original.id));
    const readDemands = async () =>
      await testDb.client
        .select()
        .from(recallDerivationState)
        .where(eq(recallDerivationState.targetId, String(original.id)));
    const rowsBefore = await readRows();
    const demandsBefore = await readDemands();
    const method = new MemoryItemApplicationMethod();
    const ctx = { projectId: project.id, db: testDb.client };

    await expect(
      method.applyCreate(applicationEntry("CREATE"), ctx),
    ).resolves.toMatchObject({ status: "FAILED" });
    await expect(
      method.applyUpdate(applicationEntry("UPDATE"), ctx),
    ).resolves.toMatchObject({ status: "FAILED" });
    await expect(
      method.applyDelete(applicationEntry("DELETE"), ctx),
    ).resolves.toMatchObject({ status: "FAILED" });
    await expect(
      method.fetchCurrentStates([String(original.id)], ctx),
    ).resolves.toEqual(new Map());
    await expect(readRows()).resolves.toEqual(rowsBefore);
    await expect(readDemands()).resolves.toEqual(demandsBefore);
  });

  it("materializes Memory Item branch merge and rebases canonical snapshots", async () => {
    await executeCommand({ db: testDb.client }, ensureLanguages, {
      languageIds: ["en", "zh-Hans"],
    });
    const user = await executeCommand({ db: testDb.client }, createUser, {
      email: `vcs-memory-${crypto.randomUUID()}@test.local`,
      name: "VCS memory tester",
    });
    const project = await executeCommand({ db: testDb.client }, createProject, {
      name: "VCS memory project",
      description: null,
      creatorId: user.id,
    });
    const memory = await executeCommand({ db: testDb.client }, createMemory, {
      name: "VCS memory",
      creatorId: user.id,
      projectIds: [project.id],
    });
    const stringIds = await executeCommand(
      { db: testDb.client },
      createVectorizedStrings,
      {
        data: [
          { text: "Save", languageId: "en" },
          { text: "保存", languageId: "zh-Hans" },
          { text: "存储", languageId: "zh-Hans" },
        ],
      },
    );
    const [
      sourceStringId,
      initialTranslationStringId,
      nextTranslationStringId,
    ] = stringIds;
    if (
      sourceStringId === undefined ||
      initialTranslationStringId === undefined ||
      nextTranslationStringId === undefined
    ) {
      throw new Error("Expected Memory Item fixture strings.");
    }
    const existingMemoryItemIds = await testDb.client
      .select({ id: memoryItem.id })
      .from(memoryItem);
    const memoryItemId =
      Math.max(0, ...existingMemoryItemIds.map((item) => item.id)) + 1;
    const createPayload = {
      memoryId: memory.id,
      translationId: null,
      sourceStringId,
      translationStringId: initialTranslationStringId,
      creatorId: user.id,
    };
    const initialPayload = { memoryItemId, ...createPayload };

    const branch = await executeCommand({ db: testDb.client }, createBranch, {
      projectId: project.id,
      name: `memory-branch-${crypto.randomUUID()}`,
      createdBy: user.id,
    });
    const branchChangeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId: project.id, branchId: branch.id, status: "PENDING" },
    );
    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: branchChangeset.id,
      entityType: "memory_item",
      entityId: String(memoryItemId),
      action: "CREATE",
      after: createPayload,
      riskLevel: "MEDIUM",
    });

    const merged = await mergeBranch(testDb.client, branch.id, user.id);
    expect(merged).toMatchObject({ success: true, hasConflicts: false });
    await createService().applyChangeSet(merged.mainChangesetId!, {
      projectId: project.id,
    });
    await expect(
      executeQuery({ db: testDb.client }, getMemoryCanonicalSnapshots, {
        memoryItemIds: [memoryItemId],
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: memoryItemId, memoryId: memory.id }),
    ]);
    await expect(
      executeQuery({ db: testDb.client }, getRecallDerivationStates, {
        references: [
          {
            targetKind: "MEMORY_ITEM",
            targetId: String(memoryItemId),
            languageId: enLanguageId,
            demandRevision: 1,
          },
          {
            targetKind: "MEMORY_ITEM",
            targetId: String(memoryItemId),
            languageId: zhHansLanguageId,
            demandRevision: 1,
          },
        ],
      }),
    ).resolves.toEqual([
      expect.objectContaining({ demandRevision: 1 }),
      expect.objectContaining({ demandRevision: 1 }),
    ]);

    const ordinary = await executeCommand(
      { db: testDb.client },
      createMemoryItems,
      {
        memoryId: memory.id,
        items: [
          {
            translationId: null,
            sourceStringId,
            translationStringId: nextTranslationStringId,
            creatorId: user.id,
          },
        ],
      },
    );
    expect(ordinary.items[0]?.id).toBeGreaterThan(memoryItemId);

    const rebaseBranchRow = await executeCommand(
      { db: testDb.client },
      createBranch,
      {
        projectId: project.id,
        name: `memory-rebase-${crypto.randomUUID()}`,
        createdBy: user.id,
      },
    );
    const rebaseChangeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      {
        projectId: project.id,
        branchId: rebaseBranchRow.id,
        status: "PENDING",
      },
    );
    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: rebaseChangeset.id,
      entityType: "memory_item",
      entityId: String(memoryItemId),
      action: "UPDATE",
      before: initialPayload,
      after: {
        ...initialPayload,
        translationStringId: nextTranslationStringId,
      },
      riskLevel: "MEDIUM",
    });

    const mainChangeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId: project.id, status: "APPROVED" },
    );
    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: mainChangeset.id,
      entityType: "memory_item",
      entityId: String(memoryItemId),
      action: "UPDATE",
      before: initialPayload,
      after: {
        ...initialPayload,
        translationStringId: nextTranslationStringId,
      },
      riskLevel: "MEDIUM",
    });
    await createService().applyChangeSet(mainChangeset.id, {
      projectId: project.id,
    });

    await rebaseBranch(
      testDb.client,
      rebaseBranchRow.id,
      getDefaultRegistries().appMethodRegistry,
    );
    const entries = await executeQuery(
      { db: testDb.client },
      getChangesetEntries,
      { changesetId: rebaseChangeset.id },
    );
    expect(entries[0]?.before).toMatchObject({
      memoryItemId,
      translationStringId: nextTranslationStringId,
    });
    await expect(
      executeQuery({ db: testDb.client }, getRecallDerivationStates, {
        references: [
          {
            targetKind: "MEMORY_ITEM",
            targetId: String(memoryItemId),
            languageId: enLanguageId,
            demandRevision: 2,
          },
          {
            targetKind: "MEMORY_ITEM",
            targetId: String(memoryItemId),
            languageId: zhHansLanguageId,
            demandRevision: 2,
          },
        ],
      }),
    ).resolves.toEqual([
      expect.objectContaining({ demandRevision: 2 }),
      expect.objectContaining({ demandRevision: 2 }),
    ]);
  });
});
