import {
  eq,
  plugin,
  pluginInstallation,
  pluginService,
  qaResult,
  qaResultItem,
  vectorizedString,
} from "@cat/db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createContentNodeUnderParent,
  createElements,
  createProject,
  createQaResultWithItems,
  createRootContentNode,
  createTranslations,
  createUser,
  ensureCoreRelationTypes,
  ensureLanguages,
} from "@/commands";
import { executeCommand } from "@/executor";
import { setupTestDB, type TestDB } from "@/testing/setup-test-db";

let testDb: TestDB;
let creatorId: string;
let checkerIds: [number, number];

const insertString = async (value: string, languageId: string) => {
  const [row] = await testDb.client
    .insert(vectorizedString)
    .values({ value, languageId })
    .returning({ id: vectorizedString.id });

  return row.id;
};

const seedTranslation = async () => {
  const project = await executeCommand({ db: testDb.client }, createProject, {
    name: `qa-result-${randomUUID()}`,
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
      displayLabel: "source.json",
      importerId: "test-json",
      sourceRootRef: "root",
      stableSourceNodeRef: `source-${randomUUID()}`,
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
          sourceNodeRef: "source.json",
          stableSourceRef: `element-${randomUUID()}`,
          stringId: sourceStringId,
          localOrder: 0,
        },
      ],
    },
  );
  const translationStringId = await insertString("你好", "zh-Hans");
  const [translationId] = await executeCommand(
    { db: testDb.client },
    createTranslations,
    {
      data: [
        {
          translatableElementId: elementId,
          translatorId: creatorId,
          stringId: translationStringId,
        },
      ],
    },
  );

  return { translationId };
};

beforeAll(async () => {
  testDb = await setupTestDB();
  await executeCommand({ db: testDb.client }, ensureCoreRelationTypes, {});
  await executeCommand({ db: testDb.client }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });
  const creator = await executeCommand({ db: testDb.client }, createUser, {
    email: `qa-result-${randomUUID()}@example.com`,
    name: "QA Result Test Creator",
  });
  creatorId = creator.id;

  const pluginId = `qa-result-plugin-${randomUUID()}`;
  await testDb.client.insert(plugin).values({
    id: pluginId,
    name: "qa-result-plugin",
    overview: "QA result test plugin",
    isExternal: false,
    entry: "dist/index.js",
    iconUrl: null,
    version: "0.0.1",
  });
  const [installation] = await testDb.client
    .insert(pluginInstallation)
    .values({ pluginId, scopeType: "GLOBAL", scopeId: "" })
    .returning({ id: pluginInstallation.id });
  const services = await testDb.client
    .insert(pluginService)
    .values([
      {
        serviceId: `qa-result-checker-a-${randomUUID()}`,
        pluginInstallationId: installation.id,
        serviceType: "QA_CHECKER",
      },
      {
        serviceId: `qa-result-checker-b-${randomUUID()}`,
        pluginInstallationId: installation.id,
        serviceType: "QA_CHECKER",
      },
    ])
    .returning({ id: pluginService.id });
  checkerIds = [services[0].id, services[1].id];
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("createQaResultWithItems", () => {
  it("returns qaResultId and inserted item ids", async () => {
    const { translationId } = await seedTranslation();

    const result = await executeCommand(
      { db: testDb.client },
      createQaResultWithItems,
      {
        translationId,
        items: [
          {
            isPassed: false,
            checkerId: checkerIds[0],
            meta: { severity: "warning", message: "Check numbers" },
          },
          {
            isPassed: true,
            checkerId: checkerIds[1],
            meta: {},
          },
        ],
      },
    );

    expect(result.qaResultId).toBeGreaterThan(0);
    expect(result.itemIds).toHaveLength(2);
    expect(new Set(result.itemIds).size).toBe(2);

    const storedQaResult = await testDb.client
      .select({ id: qaResult.id, translationId: qaResult.translationId })
      .from(qaResult)
      .where(eq(qaResult.id, result.qaResultId))
      .limit(1);
    const storedItems = await testDb.client
      .select({ id: qaResultItem.id, resultId: qaResultItem.resultId })
      .from(qaResultItem)
      .where(eq(qaResultItem.resultId, result.qaResultId));

    expect(storedQaResult[0]?.translationId).toBe(translationId);
    expect(storedItems.map((item) => item.id).sort((a, b) => a - b)).toEqual(
      [...result.itemIds].sort((a, b) => a - b),
    );
  });
});
