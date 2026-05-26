import { vectorizedString } from "@cat/db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addChangesetEntry,
  createBranch,
  createChangeset,
  createContentNodeUnderParent,
  createElements,
  createProject,
  createRootContentNode,
  ensureLanguages,
  createUser,
  ensureCoreRelationTypes,
  executeCommand,
  executeQuery,
} from "@/index";
import { getElementTranslationStatus } from "@/queries/content/get-element-translation-status.query";
import { setupTestDB, type TestDB } from "@/testing/setup-test-db";

let testDb: TestDB;
let creatorId: string;

const insertString = async (value: string, languageId: string) => {
  const [row] = await testDb.client
    .insert(vectorizedString)
    .values({ value, languageId })
    .returning({ id: vectorizedString.id });

  return row.id;
};

const seedElement = async () => {
  const project = await executeCommand({ db: testDb.client }, createProject, {
    name: `element-status-${randomUUID()}`,
    description: null,
    creatorId,
  });
  const root = await executeCommand(
    { db: testDb.client },
    createRootContentNode,
    {
      projectId: project.id,
      creatorId,
    },
  );
  const file = await executeCommand(
    { db: testDb.client },
    createContentNodeUnderParent,
    {
      projectId: project.id,
      creatorId,
      parentContentNodeId: root.id,
      kind: "FILE",
      displayLabel: "messages.json",
      importerId: "test-json",
      sourceRootRef: "root",
      stableSourceNodeRef: `messages-${randomUUID()}`,
      exportRole: "FILE",
      boundaryType: "FILE",
      localOrder: 0,
    },
  );
  const sourceStringId = await insertString("Hello", "en");
  const [elementId] = await executeCommand(
    { db: testDb.client },
    createElements,
    {
      data: [
        {
          projectId: project.id,
          primaryContentNodeId: file.id,
          importerId: "test-json",
          sourceRootRef: "root",
          sourceNodeRef: "messages.greeting",
          stableSourceRef: `element-${randomUUID()}`,
          stringId: sourceStringId,
          localOrder: 0,
        },
      ],
    },
  );

  return {
    projectId: project.id,
    elementId,
  };
};

beforeAll(async () => {
  testDb = await setupTestDB();
  await executeCommand({ db: testDb.client }, ensureCoreRelationTypes, {});
  await executeCommand({ db: testDb.client }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });
  const user = await executeCommand({ db: testDb.client }, createUser, {
    email: `element-status-${randomUUID()}@example.com`,
    name: "Element Status Tester",
  });
  creatorId = user.id;
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("getElementTranslationStatus branch overlay", () => {
  it("returns TRANSLATED for branch overlay and NO for main without branch", async () => {
    const fixture = await seedElement();
    const branch = await executeCommand({ db: testDb.client }, createBranch, {
      projectId: fixture.projectId,
      name: `overlay-${randomUUID()}`,
    });
    const changeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      {
        projectId: fixture.projectId,
        branchId: branch.id,
        status: "PENDING",
      },
    );

    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: changeset.id,
      entityType: "translation",
      entityId: randomUUID(),
      action: "CREATE",
      after: {
        translatableElementId: fixture.elementId,
        languageId: "zh-Hans",
        text: "分支译文",
        translatorId: creatorId,
        approved: false,
        createdAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
        updatedAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
      },
      riskLevel: "LOW",
    });

    await expect(
      executeQuery({ db: testDb.client }, getElementTranslationStatus, {
        elementId: fixture.elementId,
        languageId: "zh-Hans",
      }),
    ).resolves.toBe("NO");

    await expect(
      executeQuery({ db: testDb.client }, getElementTranslationStatus, {
        elementId: fixture.elementId,
        languageId: "zh-Hans",
        branchId: branch.id,
      }),
    ).resolves.toBe("TRANSLATED");
  });
});
