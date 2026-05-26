import {
  createChangeset,
  createPR,
  createProject,
  createRootContentNode,
  createUser,
  executeCommand,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import {
  createAuthedTestContext,
  setupTestDB,
  type TestDB,
} from "@cat/test-utils";
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
import { insertTerm } from "./glossary.ts";
import { create as createMemory } from "./memory.ts";

let testDb: TestDB;
let creatorId: string;

const createContext = (): Context => {
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
      drizzleDB: testDb,
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
  await testDb.cleanup();
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
        "Branch memory creation requires exactly one projectId matching the active branch project",
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
          branchId: pr.branchId,
        },
        { context: createContext() },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "projectId is required when branchId is provided",
    });
  });
});
