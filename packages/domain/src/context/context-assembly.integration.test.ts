import { contextEvidence, language, user, vectorizedString } from "@cat/db";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, test } from "vitest";

import {
  createContentNodeUnderParent,
  createElements,
  createProject,
  createRootContentNode,
  ensureCoreRelationTypes,
  ensureDefaultContextProfile,
} from "@/commands";
import { executeCommand, executeQuery } from "@/executor";
import { assembleContextEvidence } from "@/queries";
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
      name: "Context Test Creator",
      email: `context-${CREATOR_ID}@test.local`,
    })
    .onConflictDoNothing();
});

describe("assembleContextEvidence", () => {
  test("returns bounded direct evidence and local sequence neighbors", async () => {
    await executeCommand({ db: testDb.client }, ensureCoreRelationTypes, {});
    const project = await executeCommand({ db: testDb.client }, createProject, {
      name: `context-${randomUUID()}`,
      description: null,
      creatorId: CREATOR_ID,
    });
    await executeCommand({ db: testDb.client }, ensureDefaultContextProfile, {
      projectId: project.id,
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
        importerId: "json",
        sourceRootRef: "file:1",
        stableSourceNodeRef: "file:messages.json",
        exportRole: "FILE",
        boundaryType: "FILE",
        localOrder: 0,
      },
    );
    const strings = await testDb.client
      .insert(vectorizedString)
      .values([
        { value: "Hello", languageId: "en" },
        { value: "Goodbye", languageId: "en" },
      ])
      .returning({ id: vectorizedString.id });
    const ids = await executeCommand({ db: testDb.client }, createElements, {
      data: [
        {
          projectId: project.id,
          primaryContentNodeId: file.id,
          importerId: "json",
          sourceRootRef: "file:1",
          sourceNodeRef: "file:messages.json",
          stableSourceRef: "json:/hello",
          stringId: strings[0].id,
          localOrder: 0,
        },
        {
          projectId: project.id,
          primaryContentNodeId: file.id,
          importerId: "json",
          sourceRootRef: "file:1",
          sourceNodeRef: "file:messages.json",
          stableSourceRef: "json:/bye",
          stringId: strings[1].id,
          localOrder: 1,
        },
      ],
    });

    await testDb.client.insert(contextEvidence).values({
      projectId: project.id,
      attachedEndpointKind: "ELEMENT",
      translatableElementId: ids[0],
      kind: "TEXT",
      trustLevel: "VERIFIED",
      textData: "Shown on the landing page hero",
      displayLabel: "screenshot note",
    });

    const evidence = await executeQuery(
      { db: testDb.client },
      assembleContextEvidence,
      {
        elementId: ids[0],
        purpose: "EDITOR",
        maxItems: 3,
      },
    );

    expect(evidence).toHaveLength(3);
    expect(evidence[0]?.label).toBe("source text");
    expect(evidence.some((item) => item.label === "screenshot note")).toBe(
      true,
    );
    expect(
      evidence.some((item) => item.label === "local sequence neighbor"),
    ).toBe(true);
  });

  test("ensureDefaultContextProfile is idempotent", async () => {
    await executeCommand({ db: testDb.client }, ensureCoreRelationTypes, {});
    const project = await executeCommand({ db: testDb.client }, createProject, {
      name: `context-idem-${randomUUID()}`,
      description: null,
      creatorId: CREATOR_ID,
    });
    const first = await executeCommand(
      { db: testDb.client },
      ensureDefaultContextProfile,
      { projectId: project.id },
    );
    const second = await executeCommand(
      { db: testDb.client },
      ensureDefaultContextProfile,
      { projectId: project.id },
    );
    expect(first.id).toBe(second.id);
    expect(first.isDefault).toBe(true);
  });
});
