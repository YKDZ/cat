import type { EditorTranslationStatusFilter } from "@cat/shared";

import { language, sql, user, vectorizedString } from "@cat/db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  approveTranslation,
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
    name: `editor-scope-${randomUUID()}`,
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
      name: "Editor Scope Test Creator",
      email: `editor-scope-${CREATOR_ID}@test.local`,
    })
    .onConflictDoNothing();
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("editor scope elements", () => {
  test("treats empty contentNodeIds as full project and not root-direct-only", async () => {
    const fixture = await seedFixture();
    const rows = await executeQuery(
      { db: testDb.client },
      listEditorScopeElements,
      baseQuery(fixture),
    );

    expect(rows.map((row) => row.value)).toEqual([
      "Apple",
      "Banana",
      "Cherry",
      "Durian",
    ]);
  });

  test("expands a selected directory to descendant file elements", async () => {
    const fixture = await seedFixture();
    const rows = await executeQuery(
      { db: testDb.client },
      listEditorScopeElements,
      {
        ...baseQuery(fixture),
        contentNodeIds: [fixture.nodes.dirA.id],
      },
    );

    expect(rows.map((row) => row.value)).toEqual(["Apple", "Banana", "Cherry"]);
  });

  test("deduplicates overlapping multi-node filters", async () => {
    const fixture = await seedFixture();
    const rows = await executeQuery(
      { db: testDb.client },
      listEditorScopeElements,
      {
        ...baseQuery(fixture),
        contentNodeIds: [fixture.nodes.dirA.id, fixture.nodes.fileA.id],
      },
    );
    const ids = rows.map((row) => row.id);

    expect(rows.map((row) => row.value)).toEqual(["Apple", "Banana", "Cherry"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("uses the same scope for count, first element, and page index", async () => {
    const fixture = await seedFixture();
    const query = {
      ...baseQuery(fixture),
      contentNodeIds: [fixture.nodes.dirA.id],
      pageSize: 2,
    };
    const total = await executeQuery(
      { db: testDb.client },
      countEditorScopeElements,
      query,
    );
    const firstPage = await executeQuery(
      { db: testDb.client },
      listEditorScopeElements,
      { ...query, page: 0 },
    );
    const secondPage = await executeQuery(
      { db: testDb.client },
      listEditorScopeElements,
      { ...query, page: 1 },
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
    const outOfScopePage = await executeQuery(
      { db: testDb.client },
      getEditorScopeElementPageIndex,
      { ...query, elementId: fixture.elementIds.durian },
    );

    expect(total).toBe(3);
    expect(firstPage.map((row) => row.value)).toEqual(["Apple", "Banana"]);
    expect(secondPage.map((row) => row.value)).toEqual(["Cherry"]);
    expect(next?.id).toBe(fixture.elementIds.cherry);
    expect(cherryPage).toBe(1);
    expect(outOfScopePage).toBeNull();
  });

  test("applies search and target-language status filters inside the scope", async () => {
    const fixture = await seedFixture();
    const query = baseQuery(fixture);
    const valuesForStatus = async (
      statusFilter: EditorTranslationStatusFilter,
      searchQuery = "",
    ) => {
      const rows = await executeQuery(
        { db: testDb.client },
        listEditorScopeElements,
        { ...query, statusFilter, searchQuery },
      );
      return rows.map((row) => row.value);
    };

    expect(await valuesForStatus("all")).toEqual([
      "Apple",
      "Banana",
      "Cherry",
      "Durian",
    ]);
    expect(await valuesForStatus("untranslated")).toEqual(["Apple", "Durian"]);
    expect(await valuesForStatus("translated")).toEqual(["Banana", "Cherry"]);
    expect(await valuesForStatus("approved")).toEqual(["Cherry"]);
    expect(await valuesForStatus("unapproved")).toEqual(["Banana"]);
    expect(await valuesForStatus("all", "err")).toEqual(["Cherry"]);
  });
});
