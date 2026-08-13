import {
  countGlossaryConcepts,
  createInProcessCollector,
  createChangeset,
  createGlossary,
  createPR,
  createProject,
  createUser,
  ensureLanguages,
  executeCommand,
  executeQuery,
  getRecallDerivationStates,
  getLocalizationTask,
  listBranchChangesetEntries,
  listChangesets,
  listLocalizationTasks,
  domainEventBus,
  type EventCollector,
} from "@cat/domain";
import {
  eq,
  recallDerivationTaskDemand,
  setupTestDB,
  type TestDB,
} from "@cat/test-utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { executeAuthorizedGlossaryTermWrite } from "./glossary-term-write-executor.ts";

let testDb: TestDB;
let creatorId: string;

const termData = (definition: string) => [
  {
    definition,
    term: `${definition} source`,
    translation: `${definition} target`,
    termLanguageId: "en",
    translationLanguageId: "zh-Hans",
  },
];

const expectedRecallTaskSummary = (input: {
  taskId: string;
  projectId: string;
  glossaryId: string;
  references: Awaited<
    ReturnType<typeof executeAuthorizedGlossaryTermWrite>
  >["derivations"];
}) => ({
  id: input.taskId,
  task: {
    kind: "RECALL_DERIVATION",
    payload: { cancelable: true, references: input.references },
  },
  state: {
    status: "PENDING",
    revision: 1,
    progressCurrent: 0,
    progressTotal: input.references.length,
    currentFailureId: null,
    scope: { type: "PROJECT", id: input.projectId },
    actor: { type: "USER", id: creatorId },
    resources: [
      { type: "PROJECT", id: input.projectId },
      { type: "GLOSSARY", id: input.glossaryId },
    ],
    retryOfTaskId: null,
    runtime: { kind: "RECALL_DERIVATION", phase: "QUEUED", result: null },
  },
  createdAt: expect.any(Date),
  updatedAt: expect.any(Date),
  startedAt: null,
  finishedAt: null,
});

const seedProjectGlossary = async () => {
  const project = await executeCommand({ db: testDb.client }, createProject, {
    name: `Glossary write ${crypto.randomUUID()}`,
    description: null,
    creatorId,
  });
  const glossary = await executeCommand({ db: testDb.client }, createGlossary, {
    name: `Glossary ${crypto.randomUUID()}`,
    creatorId,
    projectIds: [project.id],
  });
  return { project, glossary };
};

beforeAll(async () => {
  testDb = await setupTestDB();
  await executeCommand({ db: testDb.client }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });
  const creator = await executeCommand({ db: testDb.client }, createUser, {
    email: `write-glossary-${crypto.randomUUID()}@example.com`,
    name: "Glossary write operation tester",
  });
  creatorId = creator.id;
});

afterAll(async () => {
  await testDb?.cleanup();
});

describe("executeAuthorizedGlossaryTermWrite", () => {
  it("records canonical direct writes and creates one task only for bulk imports", async () => {
    const { project, glossary } = await seedProjectGlossary();
    const bulk = await executeAuthorizedGlossaryTermWrite(
      { db: testDb.client, actorId: creatorId },
      {
        glossaryId: glossary.id,
        termsData: termData("bulk"),
        operation: "BULK_IMPORT",
        write: { mode: "direct", projectId: project.id },
      },
    );
    expect(bulk.derivations).toHaveLength(2);
    expect(bulk.recallDerivationTaskId).toBeDefined();
    const taskSummary = await executeQuery(
      { db: testDb.client },
      getLocalizationTask,
      {
        taskId: bulk.recallDerivationTaskId!,
        authorization: {
          viewerId: creatorId,
          authorizedProjectIds: [project.id],
          systemAdmin: false,
        },
      },
    );
    expect(taskSummary).toEqual(
      expectedRecallTaskSummary({
        taskId: bulk.recallDerivationTaskId!,
        projectId: project.id,
        glossaryId: glossary.id,
        references: bulk.derivations,
      }),
    );

    const direct = await executeAuthorizedGlossaryTermWrite(
      { db: testDb.client, actorId: creatorId },
      {
        glossaryId: glossary.id,
        termsData: termData("direct"),
        operation: "DIRECT_WRITE",
        write: { mode: "direct", projectId: project.id },
      },
    );
    expect(direct.recallDerivationTaskId).toBeUndefined();
    await expect(
      executeQuery({ db: testDb.client }, listChangesets, {
        projectId: project.id,
        limit: 10,
        offset: 0,
      }),
    ).resolves.toHaveLength(2);
  });

  it("rolls back direct mutations, recall state, task demand, task, and events with its outer transaction", async () => {
    const { project, glossary } = await seedProjectGlossary();
    const bufferedCollector = createInProcessCollector(domainEventBus);
    const collected: string[] = [];
    const collector = {
      collect: (events) => {
        collected.push(...events.map((event) => event.eventId));
        bufferedCollector.collect(events);
      },
      flush: async () => await bufferedCollector.flush(),
    } satisfies EventCollector;
    const published: string[] = [];
    const unsubscribe = domainEventBus.subscribeAll((event) => {
      published.push(event.eventId);
    });
    let result:
      | Awaited<ReturnType<typeof executeAuthorizedGlossaryTermWrite>>
      | undefined;

    try {
      await expect(
        testDb.client.transaction(async (tx) => {
          result = await executeAuthorizedGlossaryTermWrite(
            { db: tx, actorId: creatorId, collector },
            {
              glossaryId: glossary.id,
              termsData: termData("outer-rollback"),
              operation: "BULK_IMPORT",
              write: { mode: "direct", projectId: project.id },
            },
          );
          expect(result.recallDerivationTaskId).toBeDefined();
          const taskSummary = await executeQuery(
            { db: tx },
            getLocalizationTask,
            {
              taskId: result.recallDerivationTaskId!,
              authorization: {
                viewerId: creatorId,
                authorizedProjectIds: [project.id],
                systemAdmin: false,
              },
            },
          );
          expect(taskSummary).toEqual(
            expectedRecallTaskSummary({
              taskId: result.recallDerivationTaskId!,
              projectId: project.id,
              glossaryId: glossary.id,
              references: result.derivations,
            }),
          );
          await expect(
            tx
              .select()
              .from(recallDerivationTaskDemand)
              .where(
                eq(
                  recallDerivationTaskDemand.taskId,
                  result.recallDerivationTaskId!,
                ),
              ),
          ).resolves.toHaveLength(2);
          expect(
            await executeQuery({ db: tx }, getRecallDerivationStates, {
              references: result.derivations,
            }),
          ).toHaveLength(2);
          throw new Error("force outer rollback");
        }),
      ).rejects.toThrow("force outer rollback");

      expect(result).toBeDefined();
      const taskId = result?.recallDerivationTaskId;
      expect(taskId).toBeDefined();
      expect(collected).not.toEqual([]);
      await expect(
        executeQuery({ db: testDb.client }, countGlossaryConcepts, {
          glossaryId: glossary.id,
        }),
      ).resolves.toBe(0);
      await expect(
        executeQuery({ db: testDb.client }, listChangesets, {
          projectId: project.id,
          limit: 10,
          offset: 0,
        }),
      ).resolves.toEqual([]);
      await expect(
        executeQuery({ db: testDb.client }, getRecallDerivationStates, {
          references: result!.derivations,
        }),
      ).resolves.toEqual([]);
      await expect(
        testDb.client
          .select()
          .from(recallDerivationTaskDemand)
          .where(eq(recallDerivationTaskDemand.taskId, taskId!)),
      ).resolves.toEqual([]);
      await expect(
        executeQuery({ db: testDb.client }, listLocalizationTasks, {
          authorization: {
            viewerId: creatorId,
            authorizedProjectIds: [project.id],
            systemAdmin: false,
          },
          projectId: project.id,
          kind: "RECALL_DERIVATION",
          pageSize: 10,
        }),
      ).resolves.toMatchObject({ total: 0, items: [] });
      expect(published).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  it("keeps ordinary writes canonical without a project task", async () => {
    const { glossary } = await seedProjectGlossary();
    const result = await executeAuthorizedGlossaryTermWrite(
      { db: testDb.client, actorId: creatorId },
      {
        glossaryId: glossary.id,
        termsData: termData("ordinary"),
        operation: "DIRECT_WRITE",
        write: { mode: "direct" },
      },
    );

    expect(result.recallDerivationTaskId).toBeUndefined();
    expect(result.derivations).toHaveLength(2);
    await expect(
      executeQuery({ db: testDb.client }, countGlossaryConcepts, {
        glossaryId: glossary.id,
      }),
    ).resolves.toBe(1);
  });

  it("stores branch writes as aggregate changes without canonical demands or tasks", async () => {
    const { project, glossary } = await seedProjectGlossary();
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId: project.id,
      title: "Glossary write branch",
      body: "",
      reviewers: [],
      authorId: creatorId,
    });

    const changeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId: project.id, branchId: pr.branchId, status: "PENDING" },
    );
    const result = await executeAuthorizedGlossaryTermWrite(
      { db: testDb.client, actorId: creatorId },
      {
        glossaryId: glossary.id,
        termsData: termData("branch"),
        operation: "BULK_IMPORT",
        write: {
          mode: "branch",
          projectId: project.id,
          branchId: pr.branchId,
          branchChangesetId: changeset.id,
        },
      },
    );

    expect(result).toEqual({ derivations: [] });
    await expect(
      executeQuery({ db: testDb.client }, countGlossaryConcepts, {
        glossaryId: glossary.id,
      }),
    ).resolves.toBe(0);
    await expect(
      executeQuery({ db: testDb.client }, listBranchChangesetEntries, {
        branchId: pr.branchId,
      }),
    ).resolves.toHaveLength(1);
  });
});
