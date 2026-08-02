import { randomUUID } from "node:crypto";

import {
  createChangeset,
  createGlossary,
  createGlossaryTerms,
  createPR,
  createProject,
  createRootContentNode,
  createUser,
  executeCommand,
  executeQuery,
  getChangesetEntries,
  ensureLanguages,
  listBranchChangesetEntries,
  listBranchChangesetIds,
  listChangesets,
  countGlossaryConcepts,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import {
  createAuthedTestContext,
  setupTestDB,
  type TestDB,
} from "@cat/test-utils";
import { call } from "@orpc/server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { Context } from "#/utils/context.ts";

const mocks = vi.hoisted(() => ({
  permissionCheck: vi.fn(async () => true),
}));

vi.mock("@cat/permissions", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/permissions")>(
      "@cat/permissions",
    );

  return {
    ...actual,
    getPermissionEngine: () => ({
      check: mocks.permissionCheck,
    }),
    determineWriteMode: async () => "direct" as const,
    loadUserSystemRoles: async () => [],
  };
});

import { comment, getRootComments } from "./comment.ts";
import { get as getContentNode } from "./content-node.ts";
import {
  addTermToConcept,
  deleteTerm,
  insertTerm,
  updateConcept,
} from "./glossary.ts";
import { create as createMemory } from "./memory.ts";

let testDb: TestDB;
let creatorId: string;

const createContext = (
  client: Context["drizzleDB"]["client"] = testDb.client,
): Context => {
  const base = createAuthedTestContext(
    {
      id: creatorId,
      email: "vcs-entrypoints@test.local",
      name: "VCS Entrypoints Tester",
      emailVerified: true,
      avatarFileId: null,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    },
    {
      drizzleDB: { client } as unknown as Context["drizzleDB"],
      pluginManager: new PluginManager("GLOBAL", ""),
      helpers: {
        setCookie: () => undefined,
        delCookie: () => undefined,
        getCookie: () => null,
        getQueryParam: () => undefined,
        getReqHeader: () => undefined,
        setResHeader: () => undefined,
      },
    },
  );

  return {
    ...base,
    auth: {
      subjectType: "user",
      subjectId: creatorId,
      systemRoles: [],
      scopes: null,
    },
    csrfToken: "csrf-token",
    isSSR: true,
    isWebSocket: false,
    requestSignal: new AbortController().signal,
  } as Context;
};

const seedProject = async (label: string) => {
  const project = await executeCommand({ db: testDb.client }, createProject, {
    name: `${label}-${randomUUID()}`,
    description: null,
    creatorId,
  });

  return project;
};

beforeAll(async () => {
  testDb = await setupTestDB();
  const user = await executeCommand({ db: testDb.client }, createUser, {
    email: `vcs-entrypoints-${randomUUID()}@example.com`,
    name: "VCS Entrypoints Tester",
  });
  creatorId = user.id;
});

afterAll(async () => {
  await testDb?.cleanup();
});

describe("VCS branch-aware entrypoint guards", () => {
  beforeEach(() => {
    mocks.permissionCheck.mockReset();
    mocks.permissionCheck.mockResolvedValue(true);
  });

  it("rejects branch comments without an explicit projectId", async () => {
    const project = await seedProject("comment-branch-project");
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId: project.id,
      title: "Comment branch",
      body: "Comment branch fixture",
      authorId: creatorId,
      reviewers: [],
      branchName: "feature/comment-branch",
    });
    await executeCommand({ db: testDb.client }, createChangeset, {
      projectId: project.id,
      branchId: pr.branchId,
      status: "PENDING",
    });

    await expect(
      call(
        comment,
        {
          targetType: "ELEMENT",
          targetId: 1,
          content: "branch comment",
          languageId: "en",
          branchId: pr.branchId,
        },
        { context: createContext() },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "projectId is required when branchId is provided",
    });
  });

  it("rejects branch root-comment reads without an explicit projectId", async () => {
    const project = await seedProject("comment-read-project");
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId: project.id,
      title: "Comment read branch",
      body: "Comment read branch fixture",
      authorId: creatorId,
      reviewers: [],
      branchName: "feature/comment-read",
    });
    await executeCommand({ db: testDb.client }, createChangeset, {
      projectId: project.id,
      branchId: pr.branchId,
      status: "PENDING",
    });

    await expect(
      call(
        getRootComments,
        {
          targetType: "ELEMENT",
          targetId: 1,
          pageIndex: 0,
          pageSize: 10,
          branchId: pr.branchId,
        },
        { context: createContext() },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "projectId is required when branchId is provided",
    });
  });

  it("rejects branch content-node reads across projects", async () => {
    const projectA = await seedProject("content-node-a");
    const projectB = await seedProject("content-node-b");
    const rootB = await executeCommand(
      { db: testDb.client },
      createRootContentNode,
      {
        projectId: projectB.id,
        creatorId,
      },
    );
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId: projectA.id,
      title: "Content node branch",
      body: "Content node branch fixture",
      authorId: creatorId,
      reviewers: [],
      branchName: "feature/content-node-branch",
    });
    await executeCommand({ db: testDb.client }, createChangeset, {
      projectId: projectA.id,
      branchId: pr.branchId,
      status: "PENDING",
    });

    await expect(
      call(
        getContentNode,
        {
          contentNodeId: rootB.id,
          branchId: pr.branchId,
        },
        { context: createContext() },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: `Branch ${pr.branchId} does not belong to content node project ${projectB.id}`,
    });
  });

  it("rejects branch memory creation with multiple projectIds", async () => {
    const projectA = await seedProject("memory-a");
    const projectB = await seedProject("memory-b");
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId: projectA.id,
      title: "Memory branch",
      body: "Memory branch fixture",
      authorId: creatorId,
      reviewers: [],
      branchName: "feature/memory-branch",
    });
    await executeCommand({ db: testDb.client }, createChangeset, {
      projectId: projectA.id,
      branchId: pr.branchId,
      status: "PENDING",
    });

    await expect(
      call(
        createMemory,
        {
          name: "Branch Memory",
          projectIds: [projectA.id, projectB.id],
          branchId: pr.branchId,
        },
        { context: createContext() },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "Memory bank creation is unavailable in branch isolation until a governed Memory application method exists.",
    });
  });

  it("rejects branch glossary term inserts without an explicit projectId", async () => {
    const project = await seedProject("glossary-project");
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId: project.id,
      title: "Glossary branch",
      body: "Glossary branch fixture",
      authorId: creatorId,
      reviewers: [],
      branchName: "feature/glossary-branch",
    });
    await executeCommand({ db: testDb.client }, createChangeset, {
      projectId: project.id,
      branchId: pr.branchId,
      status: "PENDING",
    });

    await expect(
      call(
        insertTerm,
        {
          glossaryId: randomUUID(),
          termsData: [],
          operation: "DIRECT_WRITE",
          branchId: pr.branchId,
        },
        { context: createContext() },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "projectId is required when branchId is provided",
    });
  });

  it("retries concurrent branch glossary inserts without losing aggregate terms", async () => {
    const project = await seedProject("glossary-concurrent");
    const glossary = await executeCommand(
      { db: testDb.client },
      createGlossary,
      {
        name: `Concurrent ${randomUUID()}`,
        creatorId,
        projectIds: [project.id],
      },
    );
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId: project.id,
      title: "Concurrent glossary branch",
      body: "fixture",
      authorId: creatorId,
      reviewers: [],
      branchName: `feature/concurrent-${randomUUID()}`,
    });
    const [firstClient, secondClient] = await Promise.all([
      testDb.openConcurrentClient(),
      testDb.openConcurrentClient(),
    ]);
    try {
      const results = await Promise.all([
        call(
          insertTerm,
          {
            glossaryId: glossary.id,
            projectId: project.id,
            branchId: pr.branchId,
            operation: "BULK_IMPORT",
            termsData: [
              {
                definition: "shared definition",
                term: "first",
                translation: "first-target",
                termLanguageId: "en",
                translationLanguageId: "zh-Hans",
              },
            ],
          },
          { context: createContext(firstClient.client) },
        ),
        call(
          insertTerm,
          {
            glossaryId: glossary.id,
            projectId: project.id,
            branchId: pr.branchId,
            operation: "BULK_IMPORT",
            termsData: [
              {
                definition: "shared definition",
                term: "second",
                translation: "second-target",
                termLanguageId: "en",
                translationLanguageId: "zh-Hans",
              },
            ],
          },
          { context: createContext(secondClient.client) },
        ),
      ]);
      expect(results).toEqual([{ derivations: [] }, { derivations: [] }]);
    } finally {
      await Promise.all([firstClient.cleanup(), secondClient.cleanup()]);
    }
    const entries = await executeQuery(
      { db: testDb.client },
      listBranchChangesetEntries,
      { branchId: pr.branchId },
    );
    await expect(
      executeQuery({ db: testDb.client }, listBranchChangesetIds, {
        branchId: pr.branchId,
      }),
    ).resolves.toHaveLength(1);
    const snapshots = entries.map((entry) => entry.after).filter(Boolean);
    expect(snapshots).toHaveLength(2);
    const latest = snapshots[0] as {
      concept: { id: number; definition: string };
      terms: Array<{ text: string }>;
    };
    expect(latest.concept.definition).toBe("shared definition");
    expect(latest.terms.map((term) => term.text)).toEqual(
      expect.arrayContaining([
        "first",
        "first-target",
        "second",
        "second-target",
      ]),
    );
  });

  it("creates a projection Task only for direct project bulk imports", async () => {
    await executeCommand({ db: testDb.client }, ensureLanguages, {
      languageIds: ["en", "zh-Hans"],
    });
    const project = await seedProject("glossary-bulk-intent");
    const glossary = await executeCommand(
      { db: testDb.client },
      createGlossary,
      {
        name: `Bulk intent ${randomUUID()}`,
        creatorId,
        projectIds: [project.id],
      },
    );
    const bulk = await call(
      insertTerm,
      {
        glossaryId: glossary.id,
        projectId: project.id,
        operation: "BULK_IMPORT",
        termsData: [
          {
            definition: "bulk import",
            term: "source",
            translation: "target",
            termLanguageId: "en",
            translationLanguageId: "zh-Hans",
          },
        ],
      },
      { context: createContext() },
    );
    expect(bulk.recallDerivationTaskId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const direct = await call(
      insertTerm,
      {
        glossaryId: glossary.id,
        projectId: project.id,
        operation: "DIRECT_WRITE",
        termsData: [
          {
            definition: "direct write",
            term: "source-direct",
            translation: "target-direct",
            termLanguageId: "en",
            translationLanguageId: "zh-Hans",
          },
        ],
      },
      { context: createContext() },
    );
    expect(direct.recallDerivationTaskId).toBeUndefined();

    await expect(
      call(
        insertTerm,
        {
          glossaryId: glossary.id,
          operation: "BULK_IMPORT",
          termsData: [],
        },
        { context: createContext() },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects direct glossary writes for an unlinked project without audit state", async () => {
    await executeCommand({ db: testDb.client }, ensureLanguages, {
      languageIds: ["en", "zh-Hans"],
    });
    const ownerProject = await seedProject("glossary-owner");
    const otherProject = await seedProject("glossary-unlinked");
    const glossary = await executeCommand(
      { db: testDb.client },
      createGlossary,
      {
        name: `Ownership ${randomUUID()}`,
        creatorId,
        projectIds: [ownerProject.id],
      },
    );
    const created = await executeCommand(
      { db: testDb.client },
      createGlossaryTerms,
      {
        glossaryId: glossary.id,
        creatorId,
        data: [
          {
            definition: "owned",
            term: "source",
            translation: "target",
            termLanguageId: "en",
            translationLanguageId: "zh-Hans",
          },
        ],
      },
    );
    const conceptId = created.conceptIds[0]!;
    const termId = created.termIds[0]!;
    const beforeCount = await executeQuery(
      { db: testDb.client },
      countGlossaryConcepts,
      { glossaryId: glossary.id },
    );
    const beforeChangesets = await executeQuery(
      { db: testDb.client },
      listChangesets,
      { projectId: otherProject.id, limit: 100, offset: 0 },
    );
    const context = createContext();
    await expect(
      call(
        insertTerm,
        {
          glossaryId: glossary.id,
          projectId: otherProject.id,
          operation: "DIRECT_WRITE",
          termsData: [
            {
              definition: "rejected",
              term: "x",
              translation: "y",
              termLanguageId: "en",
              translationLanguageId: "zh-Hans",
            },
          ],
        },
        { context },
      ),
    ).rejects.toBeDefined();
    await expect(
      call(
        updateConcept,
        { conceptId, projectId: otherProject.id, definition: "rejected" },
        { context },
      ),
    ).rejects.toBeDefined();
    await expect(
      call(
        addTermToConcept,
        {
          conceptId,
          projectId: otherProject.id,
          text: "rejected",
          languageId: "en",
        },
        { context },
      ),
    ).rejects.toBeDefined();
    await expect(
      call(deleteTerm, { termId, projectId: otherProject.id }, { context }),
    ).rejects.toBeDefined();
    await expect(
      executeQuery({ db: testDb.client }, countGlossaryConcepts, {
        glossaryId: glossary.id,
      }),
    ).resolves.toBe(beforeCount);
    await expect(
      executeQuery({ db: testDb.client }, listChangesets, {
        projectId: otherProject.id,
        limit: 100,
        offset: 0,
      }),
    ).resolves.toEqual(beforeChangesets);
  });

  it("does not create direct audit state for missing delete or empty update", async () => {
    await executeCommand({ db: testDb.client }, ensureLanguages, {
      languageIds: ["en", "zh-Hans"],
    });
    const project = await seedProject("glossary-noop");
    const glossary = await executeCommand(
      { db: testDb.client },
      createGlossary,
      {
        name: `Noop ${randomUUID()}`,
        creatorId,
        projectIds: [project.id],
      },
    );
    const created = await executeCommand(
      { db: testDb.client },
      createGlossaryTerms,
      {
        glossaryId: glossary.id,
        creatorId,
        data: [
          {
            definition: "no-op",
            term: "source",
            translation: "target",
            termLanguageId: "en",
            translationLanguageId: "zh-Hans",
          },
        ],
      },
    );
    const before = await executeQuery({ db: testDb.client }, listChangesets, {
      projectId: project.id,
      limit: 100,
      offset: 0,
    });
    const context = createContext();
    await expect(
      call(
        deleteTerm,
        { termId: 987_654_321, projectId: project.id },
        { context },
      ),
    ).resolves.toMatchObject({ deleted: false });
    await expect(
      call(
        updateConcept,
        { conceptId: created.conceptIds[0]!, projectId: project.id },
        { context },
      ),
    ).resolves.toMatchObject({ updated: false });
    await expect(
      executeQuery({ db: testDb.client }, listChangesets, {
        projectId: project.id,
        limit: 100,
        offset: 0,
      }),
    ).resolves.toEqual(before);
  });

  it("rejects every branch glossary write when the branch project is unlinked", async () => {
    await executeCommand({ db: testDb.client }, ensureLanguages, {
      languageIds: ["en", "zh-Hans"],
    });
    const ownerProject = await seedProject("branch-glossary-owner");
    const branchProject = await seedProject("branch-glossary-unlinked");
    const glossary = await executeCommand(
      { db: testDb.client },
      createGlossary,
      {
        name: `Branch ownership ${randomUUID()}`,
        creatorId,
        projectIds: [ownerProject.id],
      },
    );
    const created = await executeCommand(
      { db: testDb.client },
      createGlossaryTerms,
      {
        glossaryId: glossary.id,
        creatorId,
        data: [
          {
            definition: "branch owner",
            term: "source",
            translation: "target",
            termLanguageId: "en",
            translationLanguageId: "zh-Hans",
          },
        ],
      },
    );
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId: branchProject.id,
      title: "Unlinked glossary branch",
      body: "",
      reviewers: [],
      authorId: creatorId,
    });
    const changeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      { projectId: branchProject.id, branchId: pr.branchId, status: "PENDING" },
    );
    const context = createContext();
    const branchInput = { branchId: pr.branchId, projectId: branchProject.id };
    await expect(
      call(
        insertTerm,
        {
          ...branchInput,
          glossaryId: glossary.id,
          operation: "DIRECT_WRITE",
          termsData: [
            {
              definition: "rejected",
              term: "x",
              translation: "y",
              termLanguageId: "en",
              translationLanguageId: "zh-Hans",
            },
          ],
        },
        { context },
      ),
    ).rejects.toBeDefined();
    await expect(
      call(
        updateConcept,
        {
          ...branchInput,
          conceptId: created.conceptIds[0]!,
          definition: "rejected",
        },
        { context },
      ),
    ).rejects.toBeDefined();
    await expect(
      call(
        addTermToConcept,
        {
          ...branchInput,
          conceptId: created.conceptIds[0]!,
          text: "rejected",
          languageId: "en",
        },
        { context },
      ),
    ).rejects.toBeDefined();
    await expect(
      call(
        deleteTerm,
        { ...branchInput, termId: created.termIds[0]! },
        { context },
      ),
    ).rejects.toBeDefined();
    await expect(
      executeQuery({ db: testDb.client }, listBranchChangesetEntries, {
        branchId: pr.branchId,
      }),
    ).resolves.toEqual([]);
    await expect(
      executeQuery({ db: testDb.client }, getChangesetEntries, {
        changesetId: changeset.id,
      }),
    ).resolves.toEqual([]);
  });
});
