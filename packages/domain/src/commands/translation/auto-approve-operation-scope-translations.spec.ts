import { eq, translatableElement, vectorizedString } from "@cat/db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  autoApproveOperationScopeTranslations,
  createContentNodeUnderParent,
  createElements,
  createProject,
  createRootContentNode,
  createTranslations,
  createUser,
  ensureCoreRelationTypes,
  ensureLanguages,
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

const seedElementWithTranslations = async (input: {
  projectId: string;
  creatorId: string;
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
      stableSourceNodeRef: `${input.label}-file-${randomUUID()}`,
      exportRole: "FILE",
      boundaryType: "FILE",
      localOrder: 0,
    },
  );

  const sourceStringId = await insertString(`${input.label}-source`, "en");
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

  const firstTranslationStringId = await insertString(
    `${input.label}-translation-a`,
    "zh-Hans",
  );
  const latestTranslationStringId = await insertString(
    `${input.label}-translation-b`,
    "zh-Hans",
  );

  const [firstTranslationId] = await executeCommand(
    { db: testDb.client },
    createTranslations,
    {
      data: [
        {
          translatableElementId: elementId,
          translatorId: input.creatorId,
          stringId: firstTranslationStringId,
        },
      ],
    },
  );
  const [latestTranslationId] = await executeCommand(
    { db: testDb.client },
    createTranslations,
    {
      data: [
        {
          translatableElementId: elementId,
          translatorId: input.creatorId,
          stringId: latestTranslationStringId,
        },
      ],
    },
  );

  return { elementId, firstTranslationId, latestTranslationId };
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

describe("autoApproveOperationScopeTranslations", () => {
  it("approves latest translation per element and emits translation:updated event", async () => {
    const user = await executeCommand({ db: testDb.client }, createUser, {
      email: `auto-approve-${randomUUID()}@example.com`,
      name: "Auto Approve User",
    });
    const project = await executeCommand({ db: testDb.client }, createProject, {
      name: `auto-approve-project-${randomUUID()}`,
      description: null,
      creatorId: user.id,
    });

    const { elementId, latestTranslationId } =
      await seedElementWithTranslations({
        projectId: project.id,
        creatorId: user.id,
        label: `auto-approve-${randomUUID()}`,
      });

    const firstRun = await autoApproveOperationScopeTranslations(
      { db: testDb.client },
      {
        elementIds: [elementId],
        languageId: "zh-Hans",
      },
    );

    expect(firstRun.result).toEqual({
      count: 1,
      approvedTranslationIds: [latestTranslationId],
    });
    expect(firstRun.events).toHaveLength(1);
    expect(firstRun.events[0]).toMatchObject({
      type: "translation:updated",
      payload: { translationIds: [latestTranslationId] },
    });

    const elementRows = await testDb.client
      .select({
        approvedTranslationId: translatableElement.approvedTranslationId,
      })
      .from(translatableElement)
      .where(eq(translatableElement.id, elementId))
      .limit(1);

    expect(elementRows).toEqual([
      {
        approvedTranslationId: latestTranslationId,
      },
    ]);

    const secondRun = await autoApproveOperationScopeTranslations(
      { db: testDb.client },
      {
        elementIds: [elementId],
        languageId: "zh-Hans",
      },
    );

    expect(secondRun.result).toEqual({
      count: 0,
      approvedTranslationIds: [],
    });
    expect(secondRun.events).toEqual([]);
  });

  it("returns empty result for empty element set", async () => {
    const output = await autoApproveOperationScopeTranslations(
      { db: testDb.client },
      {
        elementIds: [],
        languageId: "zh-Hans",
      },
    );

    expect(output.result).toEqual({
      count: 0,
      approvedTranslationIds: [],
    });
    expect(output.events).toEqual([]);
  });
});
