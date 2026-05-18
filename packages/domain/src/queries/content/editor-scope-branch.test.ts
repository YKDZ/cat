import { language, sql, user, vectorizedString } from "@cat/db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  addChangesetEntry,
  approveTranslation,
  createBranch,
  createChangeset,
  createContentNodeUnderParent,
  createElements,
  createProject,
  createRootContentNode,
  createTranslations,
  ensureCoreRelationTypes,
} from "@/commands";
import { executeCommand, executeQuery } from "@/executor";
import { setupTestDB, type TestDB } from "@/testing/setup-test-db";

import {
  countEditorScopeElements,
  getEditorScopeElementPageIndex,
  getEditorScopeFirstElement,
  listEditorScopeElements,
} from "./editor-scope-elements.query";
import { listEditorScopeContentNodes } from "./list-editor-scope-content-nodes.query";

const CREATOR_ID = randomUUID();
let testDb: TestDB;

type Fixture = Awaited<ReturnType<typeof seedFixture>>;

const insertStrings = async (rows: { value: string; languageId: string }[]) => {
  return await testDb.client
    .insert(vectorizedString)
    .values(rows)
    .onConflictDoUpdate({
      target: [vectorizedString.languageId, vectorizedString.value],
      set: { value: sql`excluded.value` },
    })
    .returning({ id: vectorizedString.id, value: vectorizedString.value });
};

const seedFixture = async () => {
  await executeCommand({ db: testDb.client }, ensureCoreRelationTypes, {});
  const project = await executeCommand({ db: testDb.client }, createProject, {
    name: `editor-scope-branch-${randomUUID()}`,
    description: null,
    creatorId: CREATOR_ID,
  });
  const root = await executeCommand(
    { db: testDb.client },
    createRootContentNode,
    { projectId: project.id, creatorId: CREATOR_ID },
  );
  const dirA = await executeCommand(
    { db: testDb.client },
    createContentNodeUnderParent,
    {
      projectId: project.id,
      creatorId: CREATOR_ID,
      parentContentNodeId: root.id,
      kind: "DIRECTORY",
      displayLabel: "dir-a",
      importerId: "test",
      sourceRootRef: "root",
      stableSourceNodeRef: `dir-a-${randomUUID()}`,
      exportRole: "DIRECTORY",
      boundaryType: "DIRECTORY",
      localOrder: 0,
    },
  );
  const dirB = await executeCommand(
    { db: testDb.client },
    createContentNodeUnderParent,
    {
      projectId: project.id,
      creatorId: CREATOR_ID,
      parentContentNodeId: root.id,
      kind: "DIRECTORY",
      displayLabel: "dir-b",
      importerId: "test",
      sourceRootRef: "root",
      stableSourceNodeRef: `dir-b-${randomUUID()}`,
      exportRole: "DIRECTORY",
      boundaryType: "DIRECTORY",
      localOrder: 1,
    },
  );
  const fileA = await executeCommand(
    { db: testDb.client },
    createContentNodeUnderParent,
    {
      projectId: project.id,
      creatorId: CREATOR_ID,
      parentContentNodeId: dirA.id,
      kind: "FILE",
      displayLabel: "a.json",
      importerId: "test-json",
      sourceRootRef: "root",
      stableSourceNodeRef: `file-a-${randomUUID()}`,
      exportRole: "FILE",
      boundaryType: "FILE",
      localOrder: 0,
    },
  );
  const fileB = await executeCommand(
    { db: testDb.client },
    createContentNodeUnderParent,
    {
      projectId: project.id,
      creatorId: CREATOR_ID,
      parentContentNodeId: dirA.id,
      kind: "FILE",
      displayLabel: "b.json",
      importerId: "test-json",
      sourceRootRef: "root",
      stableSourceNodeRef: `file-b-${randomUUID()}`,
      exportRole: "FILE",
      boundaryType: "FILE",
      localOrder: 1,
    },
  );
  const fileC = await executeCommand(
    { db: testDb.client },
    createContentNodeUnderParent,
    {
      projectId: project.id,
      creatorId: CREATOR_ID,
      parentContentNodeId: dirB.id,
      kind: "FILE",
      displayLabel: "c.json",
      importerId: "test-json",
      sourceRootRef: "root",
      stableSourceNodeRef: `file-c-${randomUUID()}`,
      exportRole: "FILE",
      boundaryType: "FILE",
      localOrder: 0,
    },
  );

  const sourceStrings = await insertStrings([
    { value: "Apple", languageId: "en" },
    { value: "Banana", languageId: "en" },
    { value: "Cherry", languageId: "en" },
    { value: "Durian", languageId: "en" },
  ]);
  const sourceIdByValue = new Map(
    sourceStrings.map((item) => [item.value, item.id]),
  );

  const elementIds = await executeCommand(
    { db: testDb.client },
    createElements,
    {
      data: [
        {
          projectId: project.id,
          primaryContentNodeId: fileA.id,
          importerId: "test-json",
          sourceRootRef: "root",
          sourceNodeRef: "a.json",
          stableSourceRef: `apple-${randomUUID()}`,
          stringId: sourceIdByValue.get("Apple")!,
          localOrder: 0,
        },
        {
          projectId: project.id,
          primaryContentNodeId: fileA.id,
          importerId: "test-json",
          sourceRootRef: "root",
          sourceNodeRef: "a.json",
          stableSourceRef: `banana-${randomUUID()}`,
          stringId: sourceIdByValue.get("Banana")!,
          localOrder: 1,
        },
        {
          projectId: project.id,
          primaryContentNodeId: fileB.id,
          importerId: "test-json",
          sourceRootRef: "root",
          sourceNodeRef: "b.json",
          stableSourceRef: `cherry-${randomUUID()}`,
          stringId: sourceIdByValue.get("Cherry")!,
          localOrder: 0,
        },
        {
          projectId: project.id,
          primaryContentNodeId: fileC.id,
          importerId: "test-json",
          sourceRootRef: "root",
          sourceNodeRef: "c.json",
          stableSourceRef: `durian-${randomUUID()}`,
          stringId: sourceIdByValue.get("Durian")!,
          localOrder: 0,
        },
      ],
    },
  );

  const targetStrings = await insertStrings([
    { value: "香蕉", languageId: "zh-Hans" },
    { value: "樱桃", languageId: "zh-Hans" },
  ]);
  const targetIdByValue = new Map(
    targetStrings.map((item) => [item.value, item.id]),
  );
  const translationIds = await executeCommand(
    { db: testDb.client },
    createTranslations,
    {
      documentId: fileA.id,
      data: [
        {
          translatableElementId: elementIds[1],
          translatorId: CREATOR_ID,
          stringId: targetIdByValue.get("香蕉")!,
        },
        {
          translatableElementId: elementIds[2],
          translatorId: CREATOR_ID,
          stringId: targetIdByValue.get("樱桃")!,
        },
      ],
    },
  );
  await executeCommand({ db: testDb.client }, approveTranslation, {
    translationId: translationIds[1],
  });

  return {
    project,
    nodes: { root, dirA, dirB, fileA, fileB, fileC },
    elementIds: {
      apple: elementIds[0],
      banana: elementIds[1],
      cherry: elementIds[2],
      durian: elementIds[3],
    },
  };
};

const baseQuery = (fixture: Fixture) => ({
  projectId: fixture.project.id,
  languageToId: "zh-Hans",
  contentNodeIds: [] as string[],
  searchQuery: "",
  statusFilter: "all" as const,
  page: 0,
  pageSize: 10,
});

const createBranchScope = async (projectId: string) => {
  const branch = await executeCommand({ db: testDb.client }, createBranch, {
    projectId,
    name: `editor-branch-${randomUUID()}`,
    createdBy: CREATOR_ID,
  });
  const changeset = await executeCommand(
    { db: testDb.client },
    createChangeset,
    {
      projectId,
      branchId: branch.id,
      createdBy: CREATOR_ID,
    },
  );

  return { branch, changeset };
};

beforeAll(async () => {
  testDb = await setupTestDB();
  await testDb.client
    .insert(language)
    .values([{ id: "en" }, { id: "zh-Hans" }])
    .onConflictDoNothing();
  await testDb.client
    .insert(user)
    .values({
      id: CREATOR_ID,
      name: "Editor Scope Branch Test Creator",
      email: `editor-scope-branch-${CREATOR_ID}@test.local`,
    })
    .onConflictDoNothing();
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("editor scope branch overlays", () => {
  test("branch element delete updates list, count, first, and page index consistently", async () => {
    const fixture = await seedFixture();
    const { branch, changeset } = await createBranchScope(fixture.project.id);

    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: changeset.id,
      entityType: "element",
      entityId: String(fixture.elementIds.cherry),
      action: "DELETE",
      riskLevel: "LOW",
    });

    const query = {
      ...baseQuery(fixture),
      branchId: branch.id,
      contentNodeIds: [fixture.nodes.dirA.id],
      pageSize: 2,
    };

    const rows = await executeQuery(
      { db: testDb.client },
      listEditorScopeElements,
      query,
    );
    const total = await executeQuery(
      { db: testDb.client },
      countEditorScopeElements,
      query,
    );
    const next = await executeQuery(
      { db: testDb.client },
      getEditorScopeFirstElement,
      { ...query, afterElementId: fixture.elementIds.banana },
    );
    const cherryPage = await executeQuery(
      { db: testDb.client },
      getEditorScopeElementPageIndex,
      { ...query, elementId: fixture.elementIds.cherry },
    );

    expect(rows.map((row) => row.value)).toEqual(["Apple", "Banana"]);
    expect(total).toBe(2);
    expect(next).toBeNull();
    expect(cherryPage).toBeNull();
  });

  test("branch translation create affects translated and untranslated scope filters", async () => {
    const fixture = await seedFixture();
    const { branch, changeset } = await createBranchScope(fixture.project.id);
    const timestamp = new Date().toISOString();

    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: changeset.id,
      entityType: "translation",
      entityId: randomUUID(),
      action: "CREATE",
      after: {
        translatableElementId: fixture.elementIds.apple,
        languageId: "zh-Hans",
        text: "苹果",
        translatorId: CREATOR_ID,
        approved: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      riskLevel: "LOW",
    });

    const translatedRows = await executeQuery(
      { db: testDb.client },
      listEditorScopeElements,
      {
        ...baseQuery(fixture),
        branchId: branch.id,
        statusFilter: "translated",
      },
    );
    const untranslatedRows = await executeQuery(
      { db: testDb.client },
      listEditorScopeElements,
      {
        ...baseQuery(fixture),
        branchId: branch.id,
        statusFilter: "untranslated",
      },
    );
    const applePage = await executeQuery(
      { db: testDb.client },
      getEditorScopeElementPageIndex,
      {
        ...baseQuery(fixture),
        branchId: branch.id,
        statusFilter: "translated",
        pageSize: 10,
        elementId: fixture.elementIds.apple,
      },
    );

    expect(translatedRows.map((row) => row.value)).toEqual([
      "Apple",
      "Banana",
      "Cherry",
    ]);
    expect(untranslatedRows.map((row) => row.value)).toEqual(["Durian"]);
    expect(applePage).toBe(0);
  });

  test("branch content-node delete removes the node from branch-visible content-node lists", async () => {
    const fixture = await seedFixture();
    const { branch, changeset } = await createBranchScope(fixture.project.id);

    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: changeset.id,
      entityType: "content_node",
      entityId: fixture.nodes.fileA.id,
      action: "DELETE",
      riskLevel: "LOW",
    });

    const rows = await executeQuery(
      { db: testDb.client },
      listEditorScopeContentNodes,
      {
        projectId: fixture.project.id,
        branchId: branch.id,
      },
    );

    expect(rows.some((row) => row.id === fixture.nodes.fileA.id)).toBe(false);
    expect(rows.some((row) => row.id === fixture.nodes.fileB.id)).toBe(true);
  });
});
