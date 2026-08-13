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
  listLocalizationTasks,
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
  writeMode: vi.fn(
    async (): Promise<"direct" | "isolation" | "no_access"> => "direct",
  ),
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
    determineWriteMode: mocks.writeMode,
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
  scopes: string[] | null = null,
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
      scopes,
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
    mocks.writeMode.mockReset();
    mocks.writeMode.mockResolvedValue("direct");
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

  it("resolves a branch glossary write from the server-owned branch project", async () => {
    const project = await seedProject("glossary-project");
    const glossary = await executeCommand(
      { db: testDb.client },
      createGlossary,
      {
        name: `Branch resolution ${randomUUID()}`,
        creatorId,
        projectIds: [project.id],
      },
    );
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
          glossaryId: glossary.id,
          termsData: [],
          operation: "DIRECT_WRITE",
          branchId: pr.branchId,
        },
        { context: createContext() },
      ),
    ).resolves.toEqual({ derivations: [] });
  });

  it("projects forced isolation and relationship denial through the glossary contract", async () => {
    const project = await seedProject("glossary-contract-denial");
    const glossary = await executeCommand(
      { db: testDb.client },
      createGlossary,
      {
        name: `Contract denial ${randomUUID()}`,
        creatorId,
        projectIds: [project.id],
      },
    );
    mocks.writeMode.mockResolvedValueOnce("isolation");
    await expect(
      call(
        insertTerm,
        {
          glossaryId: glossary.id,
          projectId: project.id,
          termsData: [],
          operation: "DIRECT_WRITE",
        },
        { context: createContext() },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: {
        operationContractErrorIdentifier: "execution_denied",
        operationFailure: { authorizationDecision: "write_mode_denied" },
      },
    });

    mocks.permissionCheck.mockResolvedValueOnce(false);
    await expect(
      call(
        insertTerm,
        {
          glossaryId: glossary.id,
          termsData: [],
          operation: "DIRECT_WRITE",
        },
        { context: createContext() },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: {
        operationContractErrorIdentifier: "relationship_denied",
        operationFailure: {
          code: "CAT_OPERATION_RELATIONSHIP_DENIED",
          message: "rebac_denied: glossary editor relationship is required",
        },
      },
    });
  });

  it("requires both glossary and project API scopes for direct project writes", async () => {
    const project = await seedProject("glossary-scope-denial");
    const glossary = await executeCommand(
      { db: testDb.client },
      createGlossary,
      {
        name: `Scope denial ${randomUUID()}`,
        creatorId,
        projectIds: [project.id],
      },
    );
    const cases: Array<{ scopes: string[]; requiredScope?: string }> = [
      { scopes: [], requiredScope: "glossary:editor" },
      { scopes: ["project:editor"], requiredScope: "glossary:editor" },
      { scopes: ["glossary:editor"], requiredScope: "project:editor" },
      { scopes: ["glossary:editor", "project:editor"] },
    ];
    for (const scopeCase of cases) {
      const invocation = call(
        insertTerm,
        {
          glossaryId: glossary.id,
          projectId: project.id,
          termsData: [],
          operation: "DIRECT_WRITE",
        },
        { context: createContext(testDb.client, scopeCase.scopes) },
      );
      if (scopeCase.requiredScope === undefined) {
        await expect(invocation).resolves.toMatchObject({ derivations: [] });
        continue;
      }
      await expect(invocation).rejects.toMatchObject({
        code: "FORBIDDEN",
        data: {
          operationContractErrorIdentifier: "execution_denied",
          operationFailure: {
            authorizationDecision: "api_key_scope_denied",
            message: `api_key_scope_denied: ${scopeCase.requiredScope} scope is required`,
          },
        },
      });
    }
  });

  it("does not create an empty branch changeset before binding access succeeds", async () => {
    const ownerProject = await seedProject("glossary-binding-owner");
    const branchProject = await seedProject("glossary-binding-branch");
    const glossary = await executeCommand(
      { db: testDb.client },
      createGlossary,
      {
        name: `Binding denial ${randomUUID()}`,
        creatorId,
        projectIds: [ownerProject.id],
      },
    );
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId: branchProject.id,
      title: "Unlinked glossary branch",
      body: "",
      reviewers: [],
      authorId: creatorId,
    });
    await expect(
      call(
        insertTerm,
        {
          glossaryId: glossary.id,
          projectId: branchProject.id,
          branchId: pr.branchId,
          termsData: [],
          operation: "DIRECT_WRITE",
        },
        { context: createContext() },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { operationContractErrorIdentifier: "relationship_denied" },
    });
    await expect(
      executeQuery({ db: testDb.client }, listBranchChangesetIds, {
        branchId: pr.branchId,
      }),
    ).resolves.toEqual([]);
  });

  it("rejects a contradictory branch project without appending a branch change", async () => {
    const requestedProject = await seedProject("glossary-requested-project");
    const branchProject = await seedProject("glossary-branch-project");
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId: branchProject.id,
      title: "Contradictory glossary branch",
      body: "",
      reviewers: [],
      authorId: creatorId,
    });

    await expect(
      call(
        insertTerm,
        {
          glossaryId: randomUUID(),
          projectId: requestedProject.id,
          branchId: pr.branchId,
          termsData: [],
          operation: "DIRECT_WRITE",
        },
        { context: createContext() },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { operationContractErrorIdentifier: "invalid_input" },
    });
    await expect(
      executeQuery({ db: testDb.client }, listBranchChangesetEntries, {
        branchId: pr.branchId,
      }),
    ).resolves.toEqual([]);
  });

  it("rolls back an earlier aggregate write when a later term group fails", async () => {
    await executeCommand({ db: testDb.client }, ensureLanguages, {
      languageIds: ["en", "zh-Hans"],
    });
    const project = await seedProject("glossary-write-rollback");
    const glossary = await executeCommand(
      { db: testDb.client },
      createGlossary,
      {
        name: `Rollback ${randomUUID()}`,
        creatorId,
        projectIds: [project.id],
      },
    );
    await expect(
      call(
        insertTerm,
        {
          glossaryId: glossary.id,
          projectId: project.id,
          operation: "BULK_IMPORT",
          termsData: [
            {
              definition: "first group",
              term: "first",
              translation: "first target",
              termLanguageId: "en",
              translationLanguageId: "zh-Hans",
            },
            {
              definition: "second group",
              term: "second",
              translation: "second target",
              termLanguageId: "missing-language",
              translationLanguageId: "zh-Hans",
            },
          ],
        },
        { context: createContext() },
      ),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      data: { operationContractErrorIdentifier: "operation_failed" },
    });
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
      executeQuery({ db: testDb.client }, listLocalizationTasks, {
        projectId: project.id,
        kind: "RECALL_DERIVATION",
        pageSize: 20,
        authorization: {
          viewerId: creatorId,
          authorizedProjectIds: [project.id],
          systemAdmin: false,
        },
      }),
    ).resolves.toMatchObject({ total: 0 });
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
