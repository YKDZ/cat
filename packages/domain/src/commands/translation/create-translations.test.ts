import { randomUUID } from "node:crypto";

import { agentRun, eq, translation, vectorizedString } from "@cat/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createContentNodeUnderParent,
  createAgentDefinition,
  createAgentRun,
  createAgentSession,
  createElements,
  createProject,
  createRootContentNode,
  createTranslations,
  createUser,
  ensureCoreRelationTypes,
  ensureLanguages,
  claimAgentRunOwner,
} from "#/commands/index.ts";
import { executeCommand, executeQuery } from "#/executor.ts";
import { getTranslationCreatedEventContext } from "#/queries/translation/get-translation-created-event-context.query.ts";
import { requireFixtureValue } from "#/testing/require-fixture-value.ts";
import { setupTestDB, type TestDB } from "#/testing/setup-test-db.ts";

let testDb: TestDB;
let creatorId: string;

const insertString = async (value: string, languageId: string) => {
  const [row] = await testDb.client
    .insert(vectorizedString)
    .values({ value, languageId })
    .returning({ id: vectorizedString.id });

  return requireFixtureValue(row).id;
};

const seedProjectElements = async (options: {
  labelPrefix: string;
  sourceTexts: string[];
}) => {
  const project = await executeCommand({ db: testDb.client }, createProject, {
    name: `${options.labelPrefix}-${randomUUID()}`,
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

  const files = await Promise.all(
    options.sourceTexts.map(async (_, index) =>
      executeCommand({ db: testDb.client }, createContentNodeUnderParent, {
        projectId: project.id,
        creatorId,
        parentContentNodeId: root.id,
        kind: "FILE",
        displayLabel: `${options.labelPrefix}-${index + 1}.json`,
        importerId: "test-json",
        sourceRootRef: "root",
        stableSourceNodeRef: `${options.labelPrefix}-file-${index}-${randomUUID()}`,
        exportRole: "FILE",
        boundaryType: "FILE",
        localOrder: index,
      }),
    ),
  );

  const stringIds = await Promise.all(
    options.sourceTexts.map(async (value) => insertString(value, "en")),
  );

  const elementIds = await executeCommand(
    { db: testDb.client },
    createElements,
    {
      data: options.sourceTexts.map((_, index) => ({
        projectId: project.id,
        primaryContentNodeId: requireFixtureValue(files[index]).id,
        importerId: "test-json",
        sourceRootRef: "root",
        sourceNodeRef: requireFixtureValue(files[index]).displayLabel,
        stableSourceRef: `${options.labelPrefix}-element-${index}-${randomUUID()}`,
        stringId: requireFixtureValue(stringIds[index]),
        localOrder: 0,
      })),
    },
  );

  return {
    project,
    files,
    elementIds,
  };
};

beforeAll(async () => {
  testDb = await setupTestDB();
  await executeCommand({ db: testDb.client }, ensureCoreRelationTypes, {});
  await executeCommand({ db: testDb.client }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });
  const user = await executeCommand({ db: testDb.client }, createUser, {
    email: `create-translations-${randomUUID()}@example.com`,
    name: "Create Translations Tester",
  });
  creatorId = user.id;
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("createTranslations", () => {
  it("atomically reuses a root-run element write after recovery", async () => {
    const fixture = await seedProjectElements({
      labelPrefix: "workflow-idempotency",
      sourceTexts: ["Recover me"],
    });
    const targetStringId = await insertString("恢复我", "zh-Hans");
    const changedTargetStringId = await insertString("请恢复我", "zh-Hans");
    const definition = await executeCommand(
      { db: testDb.client },
      createAgentDefinition,
      {
        name: `translation-owner-${randomUUID()}`,
        description: "",
        scopeType: "GLOBAL",
        scopeId: "",
        definitionId: `translation-owner-${randomUUID()}`,
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
        id: "translation-owner",
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
      {
        externalId: run.runId,
        ownerId,
        leaseDurationMs: 30_000,
      },
    );
    if (!lease) throw new Error("Expected workflow ownership lease.");
    const fence = { runId: run.runId, ownerId, epoch: lease.epoch };
    const elementId = requireFixtureValue(fixture.elementIds[0]);
    const command = {
      data: [
        {
          translatableElementId: elementId,
          translatorId: creatorId,
          stringId: targetStringId,
        },
      ],
      ownershipFence: fence,
      workflowOutput: {
        nodeId: "main",
        outputKey: `element:${elementId}`,
        idempotencyKey: `${run.runId}:element:${elementId}`,
      },
    };

    const first = await executeCommand(
      { db: testDb.client },
      createTranslations,
      command,
    );
    const recovered = await executeCommand(
      { db: testDb.client },
      createTranslations,
      {
        ...command,
        data: [
          {
            translatableElementId: elementId,
            translatorId: creatorId,
            stringId: changedTargetStringId,
          },
        ],
      },
    );

    expect(recovered).toEqual(first);
    const rows = await testDb.client
      .select({ id: translation.id })
      .from(translation)
      .where(eq(translation.translatableElementId, elementId));
    expect(rows).toEqual([{ id: requireFixtureValue(first[0]) }]);

    await testDb.client
      .update(agentRun)
      .set({ status: "cancelled" })
      .where(eq(agentRun.externalId, run.runId));
    await expect(
      executeCommand({ db: testDb.client }, createTranslations, {
        ...command,
        workflowOutput: {
          ...command.workflowOutput,
          idempotencyKey: `${run.runId}:element:${elementId}:late`,
        },
      }),
    ).rejects.toThrow("owner lease lost");
    expect(
      await testDb.client
        .select({ id: translation.id })
        .from(translation)
        .where(eq(translation.translatableElementId, elementId)),
    ).toHaveLength(1);
  });

  it("emits a project-scoped translation event with element and content-node context", async () => {
    const fixture = await seedProjectElements({
      labelPrefix: "same-project",
      sourceTexts: ["Apple", "Banana"],
    });
    const targetStringIds = await Promise.all([
      insertString("苹果", "zh-Hans"),
      insertString("香蕉", "zh-Hans"),
    ]);

    const output = await createTranslations(
      { db: testDb.client },
      {
        data: [
          {
            translatableElementId: requireFixtureValue(fixture.elementIds[0]),
            translatorId: creatorId,
            stringId: targetStringIds[0],
          },
          {
            translatableElementId: requireFixtureValue(fixture.elementIds[1]),
            translatorId: creatorId,
            stringId: targetStringIds[1],
          },
        ],
      },
    );

    expect(output.events).toHaveLength(1);
    const event = requireFixtureValue(output.events[0]);
    expect(event.type).toBe("translation:created");
    if (event.type !== "translation:created") {
      throw new Error("Expected translation:created event");
    }

    expect(event.payload.projectId).toBe(fixture.project.id);
    expect(
      [...event.payload.elementIds].sort((left, right) => left - right),
    ).toEqual([...fixture.elementIds].sort((left, right) => left - right));
    expect([...event.payload.primaryContentNodeIds].sort()).toEqual(
      fixture.files.map((file) => file.id).sort(),
    );
    expect("documentId" in event.payload).toBe(false);

    const contexts = await executeQuery(
      { db: testDb.client },
      getTranslationCreatedEventContext,
      { translationIds: output.result },
    );
    expect(contexts).toHaveLength(1);
    expect({
      ...requireFixtureValue(contexts[0]),
      translationIds: [...requireFixtureValue(contexts[0]).translationIds].sort(
        (left, right) => left - right,
      ),
      elementIds: [...requireFixtureValue(contexts[0]).elementIds].sort(
        (left, right) => left - right,
      ),
      primaryContentNodeIds: [
        ...requireFixtureValue(contexts[0]).primaryContentNodeIds,
      ].sort(),
    }).toEqual({
      projectId: fixture.project.id,
      translationIds: [...output.result].sort((left, right) => left - right),
      elementIds: [...fixture.elementIds].sort((left, right) => left - right),
      primaryContentNodeIds: fixture.files.map((file) => file.id).sort(),
    });
  });

  it("groups translation-created events by project when one command spans multiple projects", async () => {
    const fixtureA = await seedProjectElements({
      labelPrefix: "project-a",
      sourceTexts: ["Cherry"],
    });
    const fixtureB = await seedProjectElements({
      labelPrefix: "project-b",
      sourceTexts: ["Durian"],
    });
    const targetStringIds = await Promise.all([
      insertString("樱桃", "zh-Hans"),
      insertString("榴莲", "zh-Hans"),
    ]);

    const output = await createTranslations(
      { db: testDb.client },
      {
        data: [
          {
            translatableElementId: requireFixtureValue(fixtureA.elementIds[0]),
            translatorId: creatorId,
            stringId: targetStringIds[0],
          },
          {
            translatableElementId: requireFixtureValue(fixtureB.elementIds[0]),
            translatorId: creatorId,
            stringId: targetStringIds[1],
          },
        ],
      },
    );

    expect(output.events).toHaveLength(2);
    const events = output.events.filter(
      (event) => event.type === "translation:created",
    );
    expect(events).toHaveLength(2);

    const payloadByProject = new Map(
      events.map((event) => [event.payload.projectId, event.payload]),
    );

    const payloadA = payloadByProject.get(fixtureA.project.id);
    const payloadB = payloadByProject.get(fixtureB.project.id);

    expect(payloadA).toEqual({
      projectId: fixtureA.project.id,
      translationIds: [requireFixtureValue(output.result[0])],
      elementIds: [requireFixtureValue(fixtureA.elementIds[0])],
      primaryContentNodeIds: [requireFixtureValue(fixtureA.files[0]).id],
    });
    expect(payloadB).toEqual({
      projectId: fixtureB.project.id,
      translationIds: [requireFixtureValue(output.result[1])],
      elementIds: [requireFixtureValue(fixtureB.elementIds[0])],
      primaryContentNodeIds: [requireFixtureValue(fixtureB.files[0]).id],
    });

    expect(payloadA?.translationIds).not.toContain(
      requireFixtureValue(output.result[1]),
    );
    expect(payloadB?.translationIds).not.toContain(
      requireFixtureValue(output.result[0]),
    );
    expect(payloadA && "documentId" in payloadA).toBe(false);
    expect(payloadB && "documentId" in payloadB).toBe(false);
  });
});
