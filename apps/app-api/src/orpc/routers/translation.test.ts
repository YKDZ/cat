import {
  addChangesetEntry,
  createChangeset,
  createContentNodeUnderParent,
  createElements,
  createPR,
  createProject,
  createRootContentNode,
  createUser,
  ensureCoreRelationTypes,
  ensureLanguages,
  createVectorizedStrings,
  executeCommand,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import type { SerializableType } from "@cat/shared";
import {
  createAuthedTestContext,
  setupTestDB,
  type TestDB,
} from "@cat/test-utils";
import { getBranchChangesetId, type VCSContext } from "@cat/vcs";
import { call } from "@orpc/server";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { Context } from "@/utils/context";

const mocks = vi.hoisted(() => ({
  permissionCheck: vi.fn(async () => true),
  determineWriteMode: vi.fn<
    (projectId?: string) => Promise<"direct" | "isolation" | "no_access">
  >(async () => "direct"),
  interceptWrite: vi.fn(
    async <T>(
      _ctx: VCSContext,
      _entityType: string,
      _entityId: string,
      _action: "CREATE" | "UPDATE" | "DELETE",
      _before: SerializableType,
      _after: SerializableType,
      writeFn: () => Promise<T>,
    ): Promise<T> => await writeFn(),
  ),
  runGraph: vi.fn(async () => ({ translationIds: [101] })),
  firstOrGivenService: vi.fn((_: unknown, kind: string) => ({
    id: kind === "VECTOR_STORAGE" ? 1 : 2,
  })),
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
    determineWriteMode: mocks.determineWriteMode,
    loadUserSystemRoles: async () => [],
  };
});

vi.mock("@cat/server-shared", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/server-shared")>(
      "@cat/server-shared",
    );

  return {
    ...actual,
    firstOrGivenService: mocks.firstOrGivenService,
  };
});

vi.mock("@cat/workflow/tasks", async () => {
  const actual = await vi.importActual<typeof import("@cat/workflow/tasks")>(
    "@cat/workflow/tasks",
  );

  return {
    ...actual,
    runGraph: mocks.runGraph,
  };
});

vi.mock("@/utils/vcs-route-helper", async () => {
  const actual = await vi.importActual<typeof import("@/utils/vcs-route-helper")>(
    "@/utils/vcs-route-helper",
  );

  return {
    ...actual,
    createVCSRouteHelper: () => ({
      middleware: {
        interceptWrite: mocks.interceptWrite,
      },
    }),
  };
});

import { create, getAll } from "./translation.ts";

let testDb: TestDB;
let creatorId: string;

const insertString = async (value: string, languageId: string) => {
  const [stringId] = await executeCommand(
    { db: testDb.client },
    createVectorizedStrings,
    {
      data: [
        {
          text: value,
          languageId,
        },
      ],
    },
  );

  return stringId;
};

const seedProjectElement = async (label: string) => {
  const project = await executeCommand({ db: testDb.client }, createProject, {
    name: `${label}-${randomUUID()}`,
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
      displayLabel: `${label}.json`,
      importerId: "test-json",
      sourceRootRef: "root",
      stableSourceNodeRef: `${label}-node-${randomUUID()}`,
      exportRole: "FILE",
      boundaryType: "FILE",
      localOrder: 0,
    },
  );
  const sourceStringId = await insertString(`${label}-source`, "en");
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
          sourceNodeRef: `${label}.greeting`,
          stableSourceRef: `${label}-element-${randomUUID()}`,
          stringId: sourceStringId,
          localOrder: 0,
        },
      ],
    },
  );

  return {
    projectId: project.id,
    elementId,
  };
};

const createContext = (): Context => {
  const base = createAuthedTestContext(
    {
      id: creatorId,
      email: "translation-router@test.local",
      name: "Translation Router Tester",
      emailVerified: true,
      avatarFileId: null,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    },
    {
      drizzleDB: testDb,
      pluginManager: new PluginManager("GLOBAL", ""),
      helpers: {
        setCookie: () => undefined,
        delCookie: () => undefined,
        getCookie: () => null,
        getQueryParam: () => undefined,
        getReqHeader: (name) => {
          if (name === "x-csrf-token") return "csrf-token";
          return undefined;
        },
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
      traceId: undefined,
      ip: undefined,
      userAgent: undefined,
    },
    csrfToken: "csrf-token",
    isSSR: true,
    isWebSocket: false,
    requestSignal: new AbortController().signal,
  } as Context;
};

beforeAll(async () => {
  testDb = await setupTestDB();
  await executeCommand({ db: testDb.client }, ensureCoreRelationTypes, {});
  await executeCommand({ db: testDb.client }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });
  const user = await executeCommand({ db: testDb.client }, createUser, {
    email: `translation-router-${randomUUID()}@example.com`,
    name: "Translation Router Tester",
  });
  creatorId = user.id;
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("translation router branch-aware writes", () => {
  beforeEach(() => {
    mocks.permissionCheck.mockReset();
    mocks.permissionCheck.mockResolvedValue(true);
    mocks.determineWriteMode.mockReset();
    mocks.determineWriteMode.mockResolvedValue("direct");
    mocks.interceptWrite.mockClear();
    mocks.runGraph.mockClear();
    mocks.firstOrGivenService.mockClear();
  });

  it("rejects main writes when isolation is required and no branchId is provided", async () => {
    const fixture = await seedProjectElement("isolation-main");
    mocks.determineWriteMode.mockResolvedValue("isolation");

    await expect(
      call(
        create,
        {
          projectId: fixture.projectId,
          elementId: fixture.elementId,
          languageId: "zh-Hans",
          text: "需要分支的译文",
          createMemory: false,
        },
        { context: createContext() },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "isolation_forced: branchId is required for writes",
    });

    expect(mocks.runGraph).not.toHaveBeenCalled();
    expect(mocks.interceptWrite).not.toHaveBeenCalled();
  });

  it("writes branch translations into the branch changeset with explicit projectId and branchId", async () => {
    const fixture = await seedProjectElement("branch-create");
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId: fixture.projectId,
      title: "Branch workspace",
      body: "Branch workspace fixture",
      authorId: creatorId,
      reviewers: [],
      branchName: "feature/branch-workspace",
    });
    const branchChangeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      {
        projectId: fixture.projectId,
        branchId: pr.branchId,
        status: "PENDING",
      },
    );

    await expect(
      call(
        create,
        {
          projectId: fixture.projectId,
          branchId: pr.branchId,
          elementId: fixture.elementId,
          languageId: "zh-Hans",
          text: "分支译文",
          createMemory: false,
        },
        { context: createContext() },
      ),
    ).resolves.toBeUndefined();

    expect(mocks.interceptWrite).toHaveBeenCalledWith(
      {
        mode: "isolation",
        projectId: fixture.projectId,
        branchId: pr.branchId,
        branchChangesetId: branchChangeset.id,
      },
      "translation",
      expect.any(String),
      "CREATE",
      null,
      expect.objectContaining({
        translatableElementId: fixture.elementId,
        languageId: "zh-Hans",
        text: "分支译文",
      }),
      expect.any(Function),
    );
    expect(mocks.runGraph).not.toHaveBeenCalled();
  });

  it("creates an initial branch changeset on the first branch translation write", async () => {
    const fixture = await seedProjectElement("branch-first-write");
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId: fixture.projectId,
      title: "Branch first write",
      body: "Branch first write fixture",
      authorId: creatorId,
      reviewers: [],
      branchName: "feature/branch-first-write",
    });

    expect(await getBranchChangesetId(testDb.client, pr.branchId)).toBeNull();

    await expect(
      call(
        create,
        {
          projectId: fixture.projectId,
          branchId: pr.branchId,
          elementId: fixture.elementId,
          languageId: "zh-Hans",
          text: "首次分支译文",
          createMemory: false,
        },
        { context: createContext() },
      ),
    ).resolves.toBeUndefined();

    const branchChangesetId = await getBranchChangesetId(
      testDb.client,
      pr.branchId,
    );

    expect(branchChangesetId).not.toBeNull();
    expect(mocks.interceptWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "isolation",
        projectId: fixture.projectId,
        branchId: pr.branchId,
        branchChangesetId,
      }),
      "translation",
      expect.any(String),
      "CREATE",
      null,
      expect.objectContaining({
        translatableElementId: fixture.elementId,
        languageId: "zh-Hans",
        text: "首次分支译文",
      }),
      expect.any(Function),
    );
  });

  it("rejects writes when input.projectId does not match the element project", async () => {
    const projectA = await seedProjectElement("project-a");
    const projectB = await seedProjectElement("project-b");

    await expect(
      call(
        create,
        {
          projectId: projectA.projectId,
          elementId: projectB.elementId,
          languageId: "zh-Hans",
          text: "跨项目译文",
          createMemory: false,
        },
        { context: createContext() },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: `Element ${projectB.elementId} does not belong to project ${projectA.projectId}`,
    });
  });

  it("rejects branch writes when the branch belongs to another project", async () => {
    const projectA = await seedProjectElement("branch-project-a");
    const projectB = await seedProjectElement("branch-project-b");
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId: projectA.projectId,
      title: "Cross project branch",
      body: "Cross project branch fixture",
      authorId: creatorId,
      reviewers: [],
      branchName: "feature/cross-project",
    });
    await executeCommand({ db: testDb.client }, createChangeset, {
      projectId: projectA.projectId,
      branchId: pr.branchId,
      status: "PENDING",
    });

    await expect(
      call(
        create,
        {
          projectId: projectB.projectId,
          branchId: pr.branchId,
          elementId: projectB.elementId,
          languageId: "zh-Hans",
          text: "错误分支译文",
          createMemory: false,
        },
        { context: createContext() },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: `Branch ${pr.branchId} does not belong to project ${projectB.projectId}`,
    });
  });

  it("returns branch-only overlay translations as discriminated DTOs", async () => {
    const fixture = await seedProjectElement("branch-overlay");
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId: fixture.projectId,
      title: "Branch overlay read",
      body: "Branch overlay read fixture",
      authorId: creatorId,
      reviewers: [],
      branchName: "feature/branch-overlay",
    });
    const branchChangeset = await executeCommand(
      { db: testDb.client },
      createChangeset,
      {
        projectId: fixture.projectId,
        branchId: pr.branchId,
        status: "PENDING",
      },
    );
    const overlayEntityId = randomUUID();

    await executeCommand({ db: testDb.client }, addChangesetEntry, {
      changesetId: branchChangeset.id,
      entityType: "translation",
      entityId: overlayEntityId,
      action: "CREATE",
      after: {
        translatableElementId: fixture.elementId,
        languageId: "zh-Hans",
        text: "仅存在于分支的译文",
        translatorId: creatorId,
        approved: false,
        createdAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
        updatedAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
      },
      riskLevel: "LOW",
    });

    const result = await call(
      getAll,
      {
        elementId: fixture.elementId,
        languageId: "zh-Hans",
        branchId: pr.branchId,
      },
      { context: createContext() },
    );

    expect(result).toEqual([
      expect.objectContaining({
        kind: "branch-overlay",
        overlayEntityId,
        translatableElementId: fixture.elementId,
        languageId: "zh-Hans",
        text: "仅存在于分支的译文",
      }),
    ]);
    expect(result[0] && "id" in result[0]).toBe(false);
  });

  it("rejects cross-project branch reads in getAll", async () => {
    const projectA = await seedProjectElement("get-all-a");
    const projectB = await seedProjectElement("get-all-b");
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId: projectA.projectId,
      title: "Cross project read",
      body: "Cross project read fixture",
      authorId: creatorId,
      reviewers: [],
      branchName: "feature/cross-project-read",
    });
    await executeCommand({ db: testDb.client }, createChangeset, {
      projectId: projectA.projectId,
      branchId: pr.branchId,
      status: "PENDING",
    });

    await expect(
      call(
        getAll,
        {
          elementId: projectB.elementId,
          languageId: "zh-Hans",
          branchId: pr.branchId,
        },
        { context: createContext() },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: `Branch ${pr.branchId} does not belong to element project ${projectB.projectId}`,
    });
  });
});
