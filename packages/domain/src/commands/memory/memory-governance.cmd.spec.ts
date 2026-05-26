import {
  and,
  eq,
  memory,
  memoryItem,
  memoryItemDeletion,
  memoryPromotionRecord,
  personalMemoryBinding,
  vectorizedString,
} from "@cat/db";
import { randomUUID } from "node:crypto";
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
  deleteMemoryItem,
  ensureCoreRelationTypes,
  ensureLanguages,
  ensurePersonalProjectMemory,
  recordMemoryPromotion,
} from "@/commands";
import { executeCommand } from "@/executor";
import { setupTestDB, type TestDB } from "@/testing/setup-test-db";

let testDb: TestDB;

const insertString = async (value: string, languageId: string) => {
  const [row] = await testDb.client
    .insert(vectorizedString)
    .values({ value, languageId })
    .returning({ id: vectorizedString.id });

  return row.id;
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
          translatableElementId: elementId,
          translatorId: input.creatorId,
          stringId: targetStringId,
        },
      ],
    },
  );

  return { elementId, translationId };
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
    expect(memoryRows[0]).toEqual({
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

    const [createdItem] = await executeCommand(
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
            sourceTemplate: null,
            translationTemplate: null,
            slotMapping: null,
          },
        ],
      },
    );

    const deleted = await executeCommand(
      { db: testDb.client },
      deleteMemoryItem,
      {
        memoryItemId: createdItem.id,
        deletedById: user.id,
        scope: "PROJECT",
        projectId: project.id,
        reason: "cleanup",
      },
    );

    expect(deleted.deleted).toBe(true);

    const itemRows = await testDb.client
      .select({ id: memoryItem.id })
      .from(memoryItem)
      .where(eq(memoryItem.id, createdItem.id));
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
      .where(eq(memoryItemDeletion.deletedMemoryItemId, createdItem.id));

    expect(deletionRows).toEqual([
      {
        deletedMemoryItemId: createdItem.id,
        memoryId: projectMemory.id,
        projectId: project.id,
        deletedById: user.id,
        scope: "PROJECT",
        reason: "cleanup",
      },
    ]);

    const deletedAgain = await executeCommand(
      { db: testDb.client },
      deleteMemoryItem,
      {
        memoryItemId: createdItem.id,
        deletedById: user.id,
        scope: "PROJECT",
        projectId: project.id,
      },
    );

    expect(deletedAgain.deleted).toBe(false);

    const deletionRowsAfterRetry = await testDb.client
      .select({ id: memoryItemDeletion.id })
      .from(memoryItemDeletion)
      .where(eq(memoryItemDeletion.deletedMemoryItemId, createdItem.id));

    expect(deletionRowsAfterRetry).toHaveLength(1);
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
        sourceTranslationId: translationId,
        status: "PROMOTED",
        idempotencyKey,
      },
    );

    const second = await executeCommand(
      { db: testDb.client },
      recordMemoryPromotion,
      {
        projectId: project.id,
        sourceTranslationId: translationId,
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
