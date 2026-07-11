import {
  addChangesetEntry,
  createChangeset,
  createElements,
  createProject,
  createRootContentNode,
  createUser,
  createVectorizedStrings,
  ensureCoreRelationTypes,
  ensureLanguages,
  executeCommand,
  executeQuery,
  getChangeset,
  getChangesetEntries,
  listTranslationsByElement,
} from "@cat/domain";
import { assertFirstNonNullish } from "@cat/shared";
import type { TestDB } from "@cat/test-utils";
import { setupTestDB } from "@cat/test-utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ChangeSetApplicationError,
  ChangeSetService,
} from "./changeset-service.ts";
import { getDefaultRegistries } from "./index.ts";

let testDb: TestDB;

beforeAll(async () => {
  testDb = await setupTestDB();
});

afterAll(async () => {
  await testDb?.cleanup();
});

const seedTranslationTarget = async (): Promise<{
  elementId: number;
  projectId: string;
  userId: string;
}> => {
  await executeCommand({ db: testDb.client }, ensureCoreRelationTypes, {});
  await executeCommand({ db: testDb.client }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });
  const user = await executeCommand({ db: testDb.client }, createUser, {
    email: `vcs-changeset-${crypto.randomUUID()}@test.local`,
    name: "VCS changeset tester",
  });
  const project = await executeCommand({ db: testDb.client }, createProject, {
    name: "VCS changeset test project",
    description: null,
    creatorId: user.id,
  });
  const root = await executeCommand(
    { db: testDb.client },
    createRootContentNode,
    { projectId: project.id, creatorId: user.id },
  );
  const stringIds = await executeCommand(
    { db: testDb.client },
    createVectorizedStrings,
    { data: [{ text: "Source", languageId: "en" }] },
  );
  const elementIds = await executeCommand(
    { db: testDb.client },
    createElements,
    {
      data: [
        {
          projectId: project.id,
          primaryContentNodeId: root.id,
          importerId: "vcs-test",
          sourceRootRef: `project:${project.id}`,
          sourceNodeRef: "vcs-test#0",
          stableSourceRef: `vcs-test#${crypto.randomUUID()}`,
          stringId: assertFirstNonNullish(stringIds),
          creatorId: user.id,
        },
      ],
    },
  );
  return {
    elementId: assertFirstNonNullish(elementIds),
    projectId: project.id,
    userId: user.id,
  };
};

const createService = (): ChangeSetService => {
  const { diffRegistry, appMethodRegistry } = getDefaultRegistries();
  return new ChangeSetService(testDb.client, diffRegistry, appMethodRegistry);
};

describe("ChangeSetService database application", () => {
  it("persists FAILED state and leaves an invalid changeset unapplied", async () => {
    const { projectId } = await seedTranslationTarget();
    const changeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId, status: "APPROVED" },
    );
    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: changeset.id,
      entityType: "translation",
      entityId: `translation:${crypto.randomUUID()}`,
      action: "CREATE",
      after: { text: "missing identity fields" },
      riskLevel: "LOW",
    });

    await expect(
      createService().applyChangeSet(changeset.id, { projectId }),
    ).rejects.toBeInstanceOf(ChangeSetApplicationError);

    await expect(
      executeQuery({ db: testDb.client }, getChangeset, {
        changesetId: changeset.id,
      }),
    ).resolves.toMatchObject({ status: "APPROVED", asyncStatus: "HAS_FAILED" });
    await expect(
      executeQuery({ db: testDb.client }, getChangesetEntries, {
        changesetId: changeset.id,
      }),
    ).resolves.toEqual([expect.objectContaining({ asyncStatus: "FAILED" })]);
  });

  it("materializes one translation when the same CREATE is retried", async () => {
    const { elementId, projectId, userId } = await seedTranslationTarget();
    const changeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId, status: "APPROVED" },
    );
    const entityId = `translation:${crypto.randomUUID()}`;
    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: changeset.id,
      entityType: "translation",
      entityId,
      action: "CREATE",
      after: {
        translatableElementId: elementId,
        languageId: "zh-Hans",
        text: "Retry-safe translation",
        translatorId: userId,
      },
      riskLevel: "LOW",
    });

    const service = createService();
    await service.applyChangeSet(changeset.id, { projectId });
    await service.applyChangeSet(changeset.id, { projectId });

    await expect(
      executeQuery({ db: testDb.client }, listTranslationsByElement, {
        elementId,
        languageId: "zh-Hans",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        text: "Retry-safe translation",
        meta: { __catVcsEntityId: entityId },
      }),
    ]);
  });
});
