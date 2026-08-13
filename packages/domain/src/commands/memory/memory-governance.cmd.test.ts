import { randomUUID } from "node:crypto";

import {
  and,
  eq,
  memory,
  memoryItem,
  memoryItemDeletion,
  memoryPromotionRecord,
  personalMemoryBinding,
  recallDerivationState,
  vectorizedString,
} from "@cat/db";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createContentNodeUnderParent,
  createElements,
  createMemory,
  createMemoryItems,
  createProject,
  createRootContentNode,
  createTranslations,
  createUser,
  deleteMemory,
  deleteMemoryItem,
  ensureCoreRelationTypes,
  ensureLanguages,
  ensurePersonalProjectMemory,
  recordMemoryPromotion,
} from "#/commands/index.ts";
import { executeCommand } from "#/executor.ts";
import { requireFixtureValue } from "#/testing/require-fixture-value.ts";
import { setupTestDB, type TestDB } from "#/testing/setup-test-db.ts";

let testDb: TestDB;

const insertString = async (value: string, languageId: string) => {
  const [row] = await testDb.client
    .insert(vectorizedString)
    .values({ value, languageId })
    .returning({ id: vectorizedString.id });

  return requireFixtureValue(row).id;
};

const seedTranslation = async (input: {
  projectId: string;
  creatorId: string;
  sourceText: string;
  translationText: string;
  label: string;
}) => {
  const root = await executeCommand(
    { db: testDb.client },
    createRootContentNode,
    {
      projectId: input.projectId,
      creatorId: input.creatorId,
    },
  );

  const fileNode = await executeCommand(
    { db: testDb.client },
    createContentNodeUnderParent,
    {
      projectId: input.projectId,
      creatorId: input.creatorId,
      parentContentNodeId: root.id,
      kind: "FILE",
      displayLabel: `${input.label}.json`,
      importerId: "test-json",
      sourceRootRef: "root",
      stableSourceNodeRef: `${input.label}-${randomUUID()}`,
      exportRole: "FILE",
      boundaryType: "FILE",
      localOrder: 0,
    },
  );

  const sourceStringId = await insertString(input.sourceText, "en");
  const [elementId] = await executeCommand(
    { db: testDb.client },
    createElements,
    {
      data: [
        {
          projectId: input.projectId,
          primaryContentNodeId: fileNode.id,
          importerId: "test-json",
          sourceRootRef: "root",
          sourceNodeRef: `${input.label}-node`,
          stableSourceRef: `${input.label}-element-${randomUUID()}`,
          stringId: sourceStringId,
          localOrder: 0,
        },
      ],
    },
  );

  const targetStringId = await insertString(input.translationText, "zh-Hans");
  const [translationId] = await executeCommand(
    { db: testDb.client },
    createTranslations,
    {
      data: [
        {
          translatableElementId: requireFixtureValue(elementId),
          translatorId: input.creatorId,
          stringId: targetStringId,
        },
      ],
    },
  );

  return {
    elementId,
    translationId,
    sourceStringId,
    translationStringId: targetStringId,
  };
};

beforeAll(async () => {
  testDb = await setupTestDB();
  await executeCommand({ db: testDb.client }, ensureCoreRelationTypes, {});
  await executeCommand({ db: testDb.client }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("memory governance domain commands", () => {
  it("ensures personal memory per user/project pair idempotently", async () => {
    const user = await executeCommand({ db: testDb.client }, createUser, {
      email: `personal-memory-${randomUUID()}@example.com`,
      name: "Personal Memory User",
    });
    const project = await executeCommand({ db: testDb.client }, createProject, {
      name: `personal-memory-project-${randomUUID()}`,
      description: null,
      creatorId: user.id,
    });

    const first = await executeCommand(
      { db: testDb.client },
      ensurePersonalProjectMemory,
      {
        userId: user.id,
        projectId: project.id,
        name: "个人记忆 A",
      },
    );
    const second = await executeCommand(
      { db: testDb.client },
      ensurePersonalProjectMemory,
      {
        userId: user.id,
        projectId: project.id,
        name: "个人记忆 B",
      },
    );

    expect(second.memoryId).toBe(first.memoryId);

    const memoryRows = await testDb.client
      .select({
        scope: memory.scope,
        creatorId: memory.creatorId,
      })
      .from(memory)
      .where(eq(memory.id, first.memoryId))
      .limit(1);

    expect(memoryRows).toHaveLength(1);
    expect(requireFixtureValue(memoryRows[0])).toEqual({
      scope: "PERSONAL",
      creatorId: user.id,
    });

    const bindingRows = await testDb.client
      .select({ memoryId: personalMemoryBinding.memoryId })
      .from(personalMemoryBinding)
      .where(
        and(
          eq(personalMemoryBinding.userId, user.id),
          eq(personalMemoryBinding.projectId, project.id),
        ),
      );

    expect(bindingRows).toEqual([{ memoryId: first.memoryId }]);
  });

  it("deletes memory item and writes deletion audit once", async () => {
    const user = await executeCommand({ db: testDb.client }, createUser, {
      email: `memory-delete-${randomUUID()}@example.com`,
      name: "Memory Delete User",
    });
    const project = await executeCommand({ db: testDb.client }, createProject, {
      name: `memory-delete-project-${randomUUID()}`,
      description: null,
      creatorId: user.id,
    });

    const projectMemory = await executeCommand(
      { db: testDb.client },
      createMemory,
      {
        name: "Project Memory",
        creatorId: user.id,
        projectIds: [project.id],
      },
    );

    const sourceStringId = await insertString("Source Text", "en");
    const translationStringId = await insertString("译文", "zh-Hans");

    const { items: createdItems } = await executeCommand(
      { db: testDb.client },
      createMemoryItems,
      {
        memoryId: projectMemory.id,
        items: [
          {
            translationId: null,
            translationStringId,
            sourceStringId,
            creatorId: user.id,
          },
        ],
      },
    );

    const [createdItem] = createdItems;
    const deleted = await executeCommand(
      { db: testDb.client },
      deleteMemoryItem,
      {
        memoryItemId: requireFixtureValue(createdItem).id,
        deletedById: user.id,
        scope: "PROJECT",
        projectId: project.id,
        reason: "cleanup",
      },
    );

    expect(deleted.deleted).toBe(true);
    expect(deleted.derivations).toHaveLength(2);

    const itemRows = await testDb.client
      .select({ id: memoryItem.id })
      .from(memoryItem)
      .where(eq(memoryItem.id, requireFixtureValue(createdItem).id));
    expect(itemRows).toHaveLength(0);

    const deletionRows = await testDb.client
      .select({
        deletedMemoryItemId: memoryItemDeletion.deletedMemoryItemId,
        memoryId: memoryItemDeletion.memoryId,
        projectId: memoryItemDeletion.projectId,
        deletedById: memoryItemDeletion.deletedById,
        scope: memoryItemDeletion.scope,
        reason: memoryItemDeletion.reason,
      })
      .from(memoryItemDeletion)
      .where(
        eq(
          memoryItemDeletion.deletedMemoryItemId,
          requireFixtureValue(createdItem).id,
        ),
      );

    expect(deletionRows).toEqual([
      {
        deletedMemoryItemId: requireFixtureValue(createdItem).id,
        memoryId: projectMemory.id,
        projectId: project.id,
        deletedById: user.id,
        scope: "PROJECT",
        reason: "cleanup",
      },
    ]);

    const tombstones = await testDb.client
      .select({
        status: recallDerivationState.status,
        demandRevision: recallDerivationState.demandRevision,
      })
      .from(recallDerivationState)
      .where(
        and(
          eq(recallDerivationState.targetKind, "MEMORY_ITEM"),
          eq(
            recallDerivationState.targetId,
            String(requireFixtureValue(createdItem).id),
          ),
        ),
      );
    expect(tombstones).toHaveLength(2);
    expect(tombstones.every((state) => state.status === "PENDING")).toBe(true);
    expect(tombstones.every((state) => state.demandRevision === 2)).toBe(true);

    const deletedAgain = await executeCommand(
      { db: testDb.client },
      deleteMemoryItem,
      {
        memoryItemId: requireFixtureValue(createdItem).id,
        deletedById: user.id,
        scope: "PROJECT",
        projectId: project.id,
      },
    );

    expect(deletedAgain.deleted).toBe(false);
    expect(deletedAgain.derivations).toEqual([]);

    const deletionRowsAfterRetry = await testDb.client
      .select({ id: memoryItemDeletion.id })
      .from(memoryItemDeletion)
      .where(
        eq(
          memoryItemDeletion.deletedMemoryItemId,
          requireFixtureValue(createdItem).id,
        ),
      );

    expect(deletionRowsAfterRetry).toHaveLength(1);

    const { items: rollbackItems } = await executeCommand(
      { db: testDb.client },
      createMemoryItems,
      {
        memoryId: projectMemory.id,
        items: [
          {
            translationId: null,
            translationStringId,
            sourceStringId,
            creatorId: user.id,
          },
        ],
      },
    );
    const rollbackItem = requireFixtureValue(rollbackItems[0]);
    await expect(
      executeCommand({ db: testDb.client }, deleteMemoryItem, {
        memoryItemId: rollbackItem.id,
        deletedById: randomUUID(),
        scope: "PROJECT",
        projectId: project.id,
      }),
    ).rejects.toThrow();
    const rollbackCanonical = await testDb.client
      .select({ id: memoryItem.id })
      .from(memoryItem)
      .where(eq(memoryItem.id, rollbackItem.id));
    const rollbackStates = await testDb.client
      .select({
        status: recallDerivationState.status,
        demandRevision: recallDerivationState.demandRevision,
      })
      .from(recallDerivationState)
      .where(eq(recallDerivationState.targetId, String(rollbackItem.id)));
    const rollbackAudits = await testDb.client
      .select({ id: memoryItemDeletion.id })
      .from(memoryItemDeletion)
      .where(eq(memoryItemDeletion.deletedMemoryItemId, rollbackItem.id));
    expect(rollbackCanonical).toEqual([{ id: rollbackItem.id }]);
    expect(rollbackStates).toHaveLength(2);
    expect(
      rollbackStates.every(
        (state) => state.status === "PENDING" && state.demandRevision === 1,
      ),
    ).toBe(true);
    expect(rollbackAudits).toEqual([]);
  });

  it("deletes a Memory aggregate with multi-language, same-language, and empty banks", async () => {
    const user = await executeCommand({ db: testDb.client }, createUser, {
      email: `memory-aggregate-delete-${randomUUID()}@example.com`,
      name: "Memory aggregate delete user",
    });
    const aggregate = await executeCommand(
      { db: testDb.client },
      createMemory,
      {
        name: "Aggregate delete memory",
        creatorId: user.id,
      },
    );
    const enSourceId = await insertString("Save file", "en");
    const zhTranslationId = await insertString("保存文件", "zh-Hans");
    const enTranslationId = await insertString("Store file", "en");
    const created = await executeCommand(
      { db: testDb.client },
      createMemoryItems,
      {
        memoryId: aggregate.id,
        items: [
          {
            translationId: null,
            sourceStringId: enSourceId,
            translationStringId: zhTranslationId,
            creatorId: user.id,
          },
          {
            translationId: null,
            sourceStringId: enSourceId,
            translationStringId: enTranslationId,
            creatorId: user.id,
          },
        ],
      },
    );

    const deleted = await executeCommand({ db: testDb.client }, deleteMemory, {
      memoryId: aggregate.id,
      deletedById: user.id,
      projectId: null,
      reason: "aggregate cleanup",
    });
    expect(deleted).toMatchObject({ deleted: true, itemCount: 2 });
    expect(deleted.derivations).toHaveLength(3);
    await expect(
      testDb.client
        .select({ id: memory.id })
        .from(memory)
        .where(eq(memory.id, aggregate.id)),
    ).resolves.toEqual([]);
    await expect(
      testDb.client
        .select({ id: memoryItem.id })
        .from(memoryItem)
        .where(eq(memoryItem.memoryId, aggregate.id)),
    ).resolves.toEqual([]);
    await expect(
      testDb.client
        .select({ id: memoryItemDeletion.id })
        .from(memoryItemDeletion)
        .where(eq(memoryItemDeletion.memoryId, aggregate.id)),
    ).resolves.toHaveLength(2);
    expect(
      deleted.derivations.every((reference) => reference.demandRevision === 2),
    ).toBe(true);
    expect(
      new Set(deleted.derivations.map((reference) => reference.targetId)),
    ).toEqual(new Set(created.items.map((item) => String(item.id))));

    const empty = await executeCommand({ db: testDb.client }, createMemory, {
      name: "Empty aggregate delete memory",
      creatorId: user.id,
    });
    await expect(
      executeCommand({ db: testDb.client }, deleteMemory, {
        memoryId: empty.id,
        deletedById: user.id,
        projectId: null,
      }),
    ).resolves.toEqual({ deleted: true, itemCount: 0, derivations: [] });
  });

  it("rejects explicit ID and translation identity collisions without changing demands", async () => {
    const user = await executeCommand({ db: testDb.client }, createUser, {
      email: `memory-identity-${randomUUID()}@example.com`,
      name: "Memory identity user",
    });
    const firstMemory = await executeCommand(
      { db: testDb.client },
      createMemory,
      { name: "First identity memory", creatorId: user.id },
    );
    const secondMemory = await executeCommand(
      { db: testDb.client },
      createMemory,
      { name: "Second identity memory", creatorId: user.id },
    );
    const firstSource = await insertString("Identity source", "en");
    const firstTranslation = await insertString(
      "Identity translation",
      "zh-Hans",
    );
    const otherSource = await insertString("Other identity source", "en");
    const otherTranslation = await insertString(
      "Other identity translation",
      "zh-Hans",
    );
    const original = requireFixtureValue(
      (
        await executeCommand({ db: testDb.client }, createMemoryItems, {
          memoryId: firstMemory.id,
          items: [
            {
              translationId: null,
              sourceStringId: firstSource,
              translationStringId: firstTranslation,
              creatorId: user.id,
            },
          ],
        })
      ).items[0],
    );
    const readCanonical = async (ids: number[]) =>
      await testDb.client
        .select({
          id: memoryItem.id,
          memoryId: memoryItem.memoryId,
          translationId: memoryItem.translationId,
          sourceStringId: memoryItem.sourceStringId,
          translationStringId: memoryItem.translationStringId,
        })
        .from(memoryItem)
        .where(inArray(memoryItem.id, ids))
        .orderBy(memoryItem.id);
    const readDemands = async (ids: number[]) =>
      await testDb.client
        .select({
          targetId: recallDerivationState.targetId,
          languageId: recallDerivationState.languageId,
          demandRevision: recallDerivationState.demandRevision,
          canonicalInputVersion: recallDerivationState.canonicalInputVersion,
        })
        .from(recallDerivationState)
        .where(inArray(recallDerivationState.targetId, ids.map(String)))
        .orderBy(
          recallDerivationState.targetId,
          recallDerivationState.languageId,
        );
    const crossBankRows = await readCanonical([original.id]);
    const crossBankDemands = await readDemands([original.id]);
    await expect(
      executeCommand({ db: testDb.client }, createMemoryItems, {
        memoryId: secondMemory.id,
        items: [
          {
            memoryItemId: original.id,
            translationId: null,
            sourceStringId: otherSource,
            translationStringId: otherTranslation,
            creatorId: user.id,
          },
        ],
      }),
    ).rejects.toThrow("identity");
    await expect(readCanonical([original.id])).resolves.toEqual(crossBankRows);
    await expect(readDemands([original.id])).resolves.toEqual(crossBankDemands);

    const project = await executeCommand({ db: testDb.client }, createProject, {
      name: `memory-identity-project-${randomUUID()}`,
      description: null,
      creatorId: user.id,
    });
    const firstRecord = await seedTranslation({
      projectId: project.id,
      creatorId: user.id,
      sourceText: "First translated source",
      translationText: "First translated target",
      label: `identity-first-${randomUUID()}`,
    });
    const secondProject = await executeCommand(
      { db: testDb.client },
      createProject,
      {
        name: `memory-identity-second-project-${randomUUID()}`,
        description: null,
        creatorId: user.id,
      },
    );
    const secondRecord = await seedTranslation({
      projectId: secondProject.id,
      creatorId: user.id,
      sourceText: "Second translated source",
      translationText: "Second translated target",
      label: `identity-second-${randomUUID()}`,
    });
    const translated = await executeCommand(
      { db: testDb.client },
      createMemoryItems,
      {
        memoryId: firstMemory.id,
        items: [firstRecord, secondRecord].map((record) => ({
          translationId: requireFixtureValue(record.translationId),
          sourceStringId: record.sourceStringId,
          translationStringId: record.translationStringId,
          creatorId: user.id,
        })),
      },
    );
    const firstItem = requireFixtureValue(translated.items[0]);
    const secondItem = requireFixtureValue(translated.items[1]);
    const identityRows = await readCanonical([firstItem.id, secondItem.id]);
    const identityDemands = await readDemands([firstItem.id, secondItem.id]);
    await expect(
      executeCommand({ db: testDb.client }, createMemoryItems, {
        memoryId: firstMemory.id,
        items: [
          {
            memoryItemId: firstItem.id,
            translationId: requireFixtureValue(secondRecord.translationId),
            sourceStringId: secondRecord.sourceStringId,
            translationStringId: secondRecord.translationStringId,
            creatorId: user.id,
          },
        ],
      }),
    ).rejects.toThrow("identity");
    await expect(readCanonical([firstItem.id, secondItem.id])).resolves.toEqual(
      identityRows,
    );
    await expect(readDemands([firstItem.id, secondItem.id])).resolves.toEqual(
      identityDemands,
    );
  });

  it("records promotion idempotently by idempotency key", async () => {
    const user = await executeCommand({ db: testDb.client }, createUser, {
      email: `promotion-${randomUUID()}@example.com`,
      name: "Promotion User",
    });
    const project = await executeCommand({ db: testDb.client }, createProject, {
      name: `promotion-project-${randomUUID()}`,
      description: null,
      creatorId: user.id,
    });

    const { translationId } = await seedTranslation({
      projectId: project.id,
      creatorId: user.id,
      sourceText: "Create World",
      translationText: "创建世界",
      label: `promotion-${randomUUID()}`,
    });

    const idempotencyKey = `promotion-${randomUUID()}`;

    const first = await executeCommand(
      { db: testDb.client },
      recordMemoryPromotion,
      {
        projectId: project.id,
        sourceTranslationId: requireFixtureValue(translationId),
        status: "PROMOTED",
        idempotencyKey,
      },
    );

    const second = await executeCommand(
      { db: testDb.client },
      recordMemoryPromotion,
      {
        projectId: project.id,
        sourceTranslationId: requireFixtureValue(translationId),
        status: "PROMOTED",
        idempotencyKey,
      },
    );

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);

    const rows = await testDb.client
      .select({
        id: memoryPromotionRecord.id,
        projectId: memoryPromotionRecord.projectId,
        sourceTranslationId: memoryPromotionRecord.sourceTranslationId,
        status: memoryPromotionRecord.status,
      })
      .from(memoryPromotionRecord)
      .where(eq(memoryPromotionRecord.idempotencyKey, idempotencyKey));

    expect(rows).toEqual([
      {
        id: first.id,
        projectId: project.id,
        sourceTranslationId: translationId,
        status: "PROMOTED",
      },
    ]);
  });
});
