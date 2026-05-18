import { contextEvidence, vectorizedString } from "@cat/db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  addElementContextEvidence,
  createElements,
  createProject,
  createRootContentNode,
  createUser,
  ensureCoreRelationTypes,
  ensureLanguages,
} from "@/commands";
import { executeCommand } from "@/executor";
import { setupTestDB, type TestDB } from "@/testing/setup-test-db";

let testDb: TestDB;
let creatorId: string;

beforeAll(async () => {
  testDb = await setupTestDB();
  await executeCommand({ db: testDb.client }, ensureCoreRelationTypes, {});
  await executeCommand({ db: testDb.client }, ensureLanguages, {
    languageIds: ["zh-Hans"],
  });
  const user = await executeCommand({ db: testDb.client }, createUser, {
    email: `context-evidence-${randomUUID()}@example.com`,
    name: "Context Evidence Tester",
  });
  creatorId = user.id;
});

afterAll(async () => {
  await testDb.cleanup();
});

const seedElement = async (): Promise<{
  projectId: string;
  elementId: number;
}> => {
  const project = await executeCommand({ db: testDb.client }, createProject, {
    name: `context-evidence-${randomUUID()}`,
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
  const [stringRow] = await testDb.client
    .insert(vectorizedString)
    .values({
      value: `测试文案-${randomUUID()}`,
      languageId: "zh-Hans",
    })
    .returning({ id: vectorizedString.id });

  const [elementId] = await executeCommand(
    { db: testDb.client },
    createElements,
    {
      data: [
        {
          projectId: project.id,
          primaryContentNodeId: root.id,
          importerId: "test-importer",
          sourceRootRef: `project:${project.id}`,
          sourceNodeRef: `node:${randomUUID()}`,
          stableSourceRef: `stable:${randomUUID()}`,
          stringId: stringRow.id,
          localOrder: 0,
        },
      ],
    },
  );

  return { projectId: project.id, elementId };
};

describe("addElementContextEvidence", () => {
  test("rejects missing or cross-project elements and inserts nothing", async () => {
    const owned = await seedElement();
    const foreign = await seedElement();

    await expect(
      executeCommand({ db: testDb.client }, addElementContextEvidence, {
        projectId: owned.projectId,
        evidence: [
          {
            elementId: 999_999_999,
            kind: "SCREENSHOT",
            displayLabel: "missing",
            trustLevel: "COLLECTED",
            provenance: { source: "test" },
          },
          {
            elementId: foreign.elementId,
            kind: "SCREENSHOT",
            displayLabel: "foreign",
            trustLevel: "COLLECTED",
            provenance: { source: "test" },
          },
        ],
      }),
    ).rejects.toThrow(/outside project/);

    const rows = await testDb.client.select().from(contextEvidence);
    expect(rows).toHaveLength(0);
  });
});
