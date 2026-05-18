import { vectorizedString } from "@cat/db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createContentNodeUnderParent,
  createElements,
  createProject,
  createRootContentNode,
  createTranslations,
  createUser,
  ensureCoreRelationTypes,
  ensureLanguages,
} from "@/commands";
import { executeCommand, executeQuery } from "@/executor";
import { getTranslationCreatedEventContext } from "@/queries/translation/get-translation-created-event-context.query";
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
        primaryContentNodeId: files[index].id,
        importerId: "test-json",
        sourceRootRef: "root",
        sourceNodeRef: files[index].displayLabel,
        stableSourceRef: `${options.labelPrefix}-element-${index}-${randomUUID()}`,
        stringId: stringIds[index],
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
            translatableElementId: fixture.elementIds[0],
            translatorId: creatorId,
            stringId: targetStringIds[0],
          },
          {
            translatableElementId: fixture.elementIds[1],
            translatorId: creatorId,
            stringId: targetStringIds[1],
          },
        ],
      },
    );

    expect(output.events).toHaveLength(1);
    const [event] = output.events;
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
      ...contexts[0],
      translationIds: [...contexts[0].translationIds].sort(
        (left, right) => left - right,
      ),
      elementIds: [...contexts[0].elementIds].sort(
        (left, right) => left - right,
      ),
      primaryContentNodeIds: [...contexts[0].primaryContentNodeIds].sort(),
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
            translatableElementId: fixtureA.elementIds[0],
            translatorId: creatorId,
            stringId: targetStringIds[0],
          },
          {
            translatableElementId: fixtureB.elementIds[0],
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
      translationIds: [output.result[0]],
      elementIds: [fixtureA.elementIds[0]],
      primaryContentNodeIds: [fixtureA.files[0].id],
    });
    expect(payloadB).toEqual({
      projectId: fixtureB.project.id,
      translationIds: [output.result[1]],
      elementIds: [fixtureB.elementIds[0]],
      primaryContentNodeIds: [fixtureB.files[0].id],
    });

    expect(payloadA?.translationIds).not.toContain(output.result[1]);
    expect(payloadB?.translationIds).not.toContain(output.result[0]);
    expect(payloadA && "documentId" in payloadA).toBe(false);
    expect(payloadB && "documentId" in payloadB).toBe(false);
  });
});
