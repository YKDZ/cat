import { randomUUID } from "node:crypto";

import {
  eq,
  plugin,
  pluginInstallation,
  pluginService,
  qaResult,
  qaResultItem,
  vectorizedString,
} from "@cat/db";
import { ServiceImplementationReferenceSchema } from "@cat/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  claimAgentRunOwner,
  createAgentDefinition,
  createAgentRun,
  createAgentSession,
  createContentNodeUnderParent,
  createElements,
  createProject,
  createQaResultWithItems,
  createRootContentNode,
  createTranslations,
  createUser,
  ensureCoreRelationTypes,
  ensureLanguages,
} from "#/commands/index.ts";
import { executeCommand } from "#/executor.ts";
import { requireFixtureValue } from "#/testing/require-fixture-value.ts";
import { setupTestDB, type TestDB } from "#/testing/setup-test-db.ts";

let testDb: TestDB;
let creatorId: string;
const checkerReferenceA = ServiceImplementationReferenceSchema.parse({
  pluginId: "qa-result-checker",
  serviceId: "checker-a",
  serviceType: "QA_CHECKER",
  scopeType: "GLOBAL",
  scopeId: "",
});
const checkerReferenceB = ServiceImplementationReferenceSchema.parse({
  pluginId: "qa-result-checker",
  serviceId: "checker-b",
  serviceType: "QA_CHECKER",
  scopeType: "GLOBAL",
  scopeId: "",
});

const insertString = async (value: string, languageId: string) => {
  const [row] = await testDb.client
    .insert(vectorizedString)
    .values({ value, languageId })
    .returning({ id: vectorizedString.id });

  return requireFixtureValue(row).id;
};

const seedTranslation = async () => {
  const fixtureId = randomUUID();
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
  const sourceStringId = await insertString(`Hello ${fixtureId}`, "en");
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
  const translationStringId = await insertString(
    `你好 ${fixtureId}`,
    "zh-Hans",
  );
  const [translationId] = await executeCommand(
    { db: testDb.client },
    createTranslations,
    {
      data: [
        {
          translatableElementId: requireFixtureValue(elementId),
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
  await testDb.client
    .insert(pluginService)
    .values([
      {
        serviceId: `qa-result-checker-a-${randomUUID()}`,
        pluginInstallationId: requireFixtureValue(installation).id,
        serviceType: "QA_CHECKER",
      },
      {
        serviceId: `qa-result-checker-b-${randomUUID()}`,
        pluginInstallationId: requireFixtureValue(installation).id,
        serviceType: "QA_CHECKER",
      },
    ])
    .returning({ id: pluginService.id });
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("createQaResultWithItems", () => {
  it("reuses an owned QA phase after a crash between downstream phases", async () => {
    const { translationId } = await seedTranslation();
    const persistedTranslationId = requireFixtureValue(translationId);
    const definition = await executeCommand(
      { db: testDb.client },
      createAgentDefinition,
      {
        name: `qa-owner-${randomUUID()}`,
        description: "",
        scopeType: "GLOBAL",
        scopeId: "",
        definitionId: `qa-owner-${randomUUID()}`,
        version: "1.0.0",
        type: "WORKFLOW",
        tools: [],
        content: "",
        isBuiltin: false,
      },
    );
    const session = await executeCommand(
      { db: testDb.client },
      createAgentSession,
      { agentDefinitionId: definition.id, userId: creatorId },
    );
    const run = await executeCommand({ db: testDb.client }, createAgentRun, {
      sessionId: session.sessionId,
      graphDefinition: {
        id: "qa-owner",
        version: "1.0.0",
        nodes: { main: { id: "main", type: "transform", config: {} } },
        edges: [],
        entry: "main",
      },
    });
    const ownerId = randomUUID();
    const lease = await executeCommand(
      { db: testDb.client },
      claimAgentRunOwner,
      { externalId: run.runId, ownerId, leaseDurationMs: 30_000 },
    );
    if (!lease) throw new Error("Expected workflow ownership lease.");
    const workflowOutput = {
      nodeId: "main",
      outputKey: `qa-translation:${persistedTranslationId}`,
      idempotencyKey: `${run.runId}:qa-translation:${persistedTranslationId}`,
    };
    const ownershipFence = {
      runId: run.runId,
      ownerId,
      epoch: lease.epoch,
    };

    const first = await executeCommand(
      { db: testDb.client },
      createQaResultWithItems,
      {
        translationId: persistedTranslationId,
        items: [{ isPassed: true, checker: checkerReferenceA, meta: {} }],
        ownershipFence,
        workflowOutput,
      },
    );
    const recovered = await executeCommand(
      { db: testDb.client },
      createQaResultWithItems,
      {
        translationId: persistedTranslationId,
        items: [
          {
            isPassed: false,
            checker: checkerReferenceB,
            meta: { secondPass: true },
          },
        ],
        ownershipFence,
        workflowOutput,
      },
    );

    expect(recovered).toEqual(first);
    expect(
      await testDb.client
        .select({ id: qaResult.id })
        .from(qaResult)
        .where(eq(qaResult.translationId, persistedTranslationId)),
    ).toEqual([{ id: first.qaResultId }]);
    expect(
      await testDb.client
        .select({ id: qaResultItem.id })
        .from(qaResultItem)
        .where(eq(qaResultItem.resultId, first.qaResultId)),
    ).toHaveLength(1);
  });

  it("returns qaResultId and inserted item ids", async () => {
    const { translationId } = await seedTranslation();

    const result = await executeCommand(
      { db: testDb.client },
      createQaResultWithItems,
      {
        translationId: requireFixtureValue(translationId),
        items: [
          {
            isPassed: false,
            checker: checkerReferenceA,
            meta: { severity: "warning", message: "Check numbers" },
          },
          {
            isPassed: true,
            checker: checkerReferenceB,
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
      .select({
        id: qaResultItem.id,
        resultId: qaResultItem.resultId,
        checker: qaResultItem.checker,
      })
      .from(qaResultItem)
      .where(eq(qaResultItem.resultId, result.qaResultId));

    expect(requireFixtureValue(storedQaResult[0])?.translationId).toBe(
      translationId,
    );
    expect(storedItems.map((item) => item.id).sort((a, b) => a - b)).toEqual(
      [...result.itemIds].sort((a, b) => a - b),
    );
    expect(storedItems.map((item) => item.checker)).toEqual([
      checkerReferenceA,
      checkerReferenceB,
    ]);
  });
});
