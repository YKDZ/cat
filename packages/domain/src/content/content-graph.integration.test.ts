import {
  contentRelation,
  contentRelationType,
  eq,
  language,
  user,
  vectorizedString,
} from "@cat/db";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, test } from "vitest";

import {
  createContentNodeUnderParent,
  createElements,
  createProject,
  createRootContentNode,
  ensureCoreRelationTypes,
} from "@/commands";
import { executeCommand, executeQuery } from "@/executor";
import { getContentNodeElements, listNeighborElements } from "@/queries";
import { setupTestDB, type TestDB } from "@/testing/setup-test-db";

const CREATOR_ID = randomUUID();
let testDb: TestDB;

beforeAll(async () => {
  testDb = await setupTestDB();
  await testDb.client
    .insert(language)
    .values({ id: "en" })
    .onConflictDoNothing();
  await testDb.client
    .insert(user)
    .values({
      id: CREATOR_ID,
      name: "Graph Test Creator",
      email: `graph-${CREATOR_ID}@test.local`,
    })
    .onConflictDoNothing();
});

describe("content graph domain commands", () => {
  test("core relation types are idempotently registered", async () => {
    const first = await executeCommand(
      { db: testDb.client },
      ensureCoreRelationTypes,
      {},
    );
    const second = await executeCommand(
      { db: testDb.client },
      ensureCoreRelationTypes,
      {},
    );
    expect(first["core:contains:1.0.0"]).toBe(second["core:contains:1.0.0"]);

    const rows = await testDb.client
      .select()
      .from(contentRelationType)
      .where(eq(contentRelationType.name, "contains"));
    expect(rows).toHaveLength(1);
  });

  test("content nodes and elements use primary containment relations", async () => {
    await executeCommand({ db: testDb.client }, ensureCoreRelationTypes, {});
    const project = await executeCommand({ db: testDb.client }, createProject, {
      name: `graph-${randomUUID()}`,
      description: null,
      creatorId: CREATOR_ID,
    });
    const root = await executeCommand(
      { db: testDb.client },
      createRootContentNode,
      {
        projectId: project.id,
        creatorId: CREATOR_ID,
      },
    );
    const file = await executeCommand(
      { db: testDb.client },
      createContentNodeUnderParent,
      {
        projectId: project.id,
        creatorId: CREATOR_ID,
        parentContentNodeId: root.id,
        kind: "FILE",
        displayLabel: "messages.json",
        importerId: "test-json",
        sourceRootRef: "upload:1",
        stableSourceNodeRef: "file:messages.json",
        exportRole: "FILE",
        boundaryType: "FILE",
        localOrder: 0,
      },
    );

    const vector = await testDb.client
      .insert(vectorizedString)
      .values([
        { value: "Hello", languageId: "en" },
        { value: "Bye", languageId: "en" },
      ])
      .returning({ id: vectorizedString.id });

    const ids = await executeCommand({ db: testDb.client }, createElements, {
      data: [
        {
          projectId: project.id,
          primaryContentNodeId: file.id,
          importerId: "test-json",
          sourceRootRef: "upload:1",
          sourceNodeRef: "file:messages.json",
          stableSourceRef: "json:/hello",
          stringId: vector[0].id,
          localOrder: 0,
        },
        {
          projectId: project.id,
          primaryContentNodeId: file.id,
          importerId: "test-json",
          sourceRootRef: "upload:1",
          sourceNodeRef: "file:messages.json",
          stableSourceRef: "json:/bye",
          stringId: vector[1].id,
          localOrder: 1,
        },
      ],
    });

    const primaryRelations = await testDb.client
      .select()
      .from(contentRelation)
      .where(eq(contentRelation.isPrimary, true));
    expect(primaryRelations.some((r) => r.targetNodeId === file.id)).toBe(true);
    expect(
      primaryRelations.filter((r) => ids.includes(r.targetElementId ?? -1)),
    ).toHaveLength(2);

    const page = await executeQuery(
      { db: testDb.client },
      getContentNodeElements,
      {
        contentNodeId: file.id,
        page: 0,
        pageSize: 10,
        languageId: "en",
      },
    );
    expect(page.map((row) => row.value)).toEqual(["Hello", "Bye"]);

    const neighbors = await executeQuery(
      { db: testDb.client },
      listNeighborElements,
      {
        elementId: ids[0],
        before: 1,
        after: 1,
      },
    );
    expect(neighbors.after.map((row) => row.id)).toEqual([ids[1]]);
  });
});
