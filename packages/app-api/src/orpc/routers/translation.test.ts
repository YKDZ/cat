import { randomUUID } from "node:crypto";

import {
  addChangesetEntry,
  createChangeset,
  createContentNodeUnderParent,
  createElements,
  createPR,
  createProject,
  createRootContentNode,
  createTranslations,
  createUser,
  createVectorizedStrings,
  ensureCoreRelationTypes,
  ensureLanguages,
  executeCommand,
  executeQuery,
  getOperationFailure,
  getPRDiff,
  listLocalizationTasks,
  listPRs,
  grantPermissionTuple,
  MemoryCacheStore,
} from "@cat/domain";
import { initPermissionEngine } from "@cat/permissions";
import { PluginManager } from "@cat/plugin-core";
import type { EntityType, SerializableType } from "@cat/shared";
import type { Relation } from "@cat/shared";
import {
  createAuthedTestContext,
  setupTestDB,
  type TestDB,
} from "@cat/test-utils";
import { getBranchChangesetId, type VCSContext } from "@cat/vcs";
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

type FakeRunGraphInput = {
  data: Array<{
    translatableElementId: number;
    translatorId?: string | null;
    text: string;
    languageId: string;
  }>;
};

type FakeRunGraphOptions = {
  vcsContext?: VCSContext;
};

const mocks = vi.hoisted(() => ({
  interceptWrite: vi.fn(
    async (
      ctx: VCSContext,
      entityType: EntityType,
      entityId: string,
      action: "CREATE" | "UPDATE" | "DELETE",
      before: SerializableType,
      after: SerializableType,
      writeFn: () => Promise<unknown>,
    ): Promise<unknown> => {
      if (ctx.mode === "isolation" && ctx.branchChangesetId !== undefined) {
        await executeCommand({ db: testDb.client }, addChangesetEntry, {
          changesetId: ctx.branchChangesetId,
          entityType,
          entityId,
          action,
          before,
          after,
          riskLevel: "LOW",
        });

        return after;
      }

      return await writeFn();
    },
  ),
  runGraph: vi.fn<
    (
      graph: unknown,
      input: FakeRunGraphInput,
      options?: FakeRunGraphOptions,
    ) => Promise<{ translationIds: number[] }>
  >(async () => ({ translationIds: [101] })),
  selectFirstServiceImplementation: vi.fn(
    (_: unknown, kind: string): { id: number } | null => ({
      id: kind === "VECTOR_STORAGE" ? 1 : 2,
    }),
  ),
  ensureBranchWriteContext: vi.fn(),
}));

vi.mock("@cat/server-shared", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/server-shared")>(
      "@cat/server-shared",
    );

  return {
    ...actual,
    selectFirstServiceImplementation: mocks.selectFirstServiceImplementation,
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

vi.mock("#/utils/vcs-route-helper.ts", async () => {
  const actual = await vi.importActual<
    typeof import("#/utils/vcs-route-helper.ts")
  >("#/utils/vcs-route-helper.ts");

  return {
    ...actual,
    createVCSRouteHelper: () => ({
      middleware: {
        interceptWrite: mocks.interceptWrite,
      },
    }),
    ensureBranchWriteContext: mocks.ensureBranchWriteContext.mockImplementation(
      actual.ensureBranchWriteContext,
    ),
  };
});

import { autoTranslate, create, getAll } from "./translation.ts";

let testDb: TestDB;
let creatorUser: NonNullable<Context["user"]>;

const getCreatorId = () => creatorUser.id;

type AuthedContext = Context & {
  user: NonNullable<Context["user"]>;
  auth: NonNullable<Context["auth"]>;
};

const requireFirst = <T>(values: readonly T[], operation: string): T => {
  const value = values[0];
  if (value === undefined) {
    throw new Error(`${operation} returned no values`);
  }
  return value;
};

const insertString = async (value: string, languageId: string) => {
  const stringIds = await executeCommand(
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

  return requireFirst(stringIds, "create vectorized string");
};

const grantProjectRelation = async (
  userId: string,
  projectId: string,
  relation: Relation,
) => {
  await executeCommand({ db: testDb.client }, grantPermissionTuple, {
    subjectType: "user",
    subjectId: userId,
    relation,
    objectType: "project",
    objectId: projectId,
  });
};

const seedProjectElement = async (
  label: string,
  options: { grantEditor?: boolean } = {},
) => {
  const project = await executeCommand({ db: testDb.client }, createProject, {
    name: `${label}-${randomUUID()}`,
    description: null,
    creatorId: getCreatorId(),
  });
  if (options.grantEditor !== false) {
    await grantProjectRelation(getCreatorId(), project.id, "editor");
  }
  const root = await executeCommand(
    { db: testDb.client },
    createRootContentNode,
    {
      projectId: project.id,
      creatorId: getCreatorId(),
    },
  );
  const file = await executeCommand(
    { db: testDb.client },
    createContentNodeUnderParent,
    {
      projectId: project.id,
      creatorId: getCreatorId(),
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
  const elementIds = await executeCommand(
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
  const elementId = requireFirst(elementIds, "create element");

  return {
    projectId: project.id,
    elementId,
    fileId: file.id,
    sourceStringId,
  };
};

const createContext = (
  options: {
    user?: NonNullable<Context["user"]>;
    scopes?: string[] | null;
  } = {},
): AuthedContext => {
  const user = options.user ?? creatorUser;
  const base = createAuthedTestContext(user, {
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
  });

  const context: Context = {
    ...base,
    auth: {
      subjectType: "user",
      subjectId: user.id,
      systemRoles: [],
      scopes: options.scopes ?? null,
    },
    csrfToken: "csrf-token",
    isSSR: true,
    isWebSocket: false,
    requestSignal: new AbortController().signal,
  };

  if (context.user === null || context.auth === null) {
    throw new Error("Expected authenticated test context");
  }

  return {
    ...context,
    user: context.user,
    auth: context.auth,
  };
};

// Keep the fake at the workflow boundary; route and contract assertions read back through public interfaces.
const writeTranslationsWithFakeGraph = async (
  _graph: unknown,
  input: FakeRunGraphInput,
  _options?: FakeRunGraphOptions,
): Promise<{ translationIds: number[] }> => {
  const stringIds = await executeCommand(
    { db: testDb.client },
    createVectorizedStrings,
    {
      data: input.data.map((item) => ({
        text: item.text,
        languageId: item.languageId,
      })),
    },
  );

  const translationIds = await executeCommand(
    { db: testDb.client },
    createTranslations,
    {
      data: input.data.map((item, index) => ({
        translatableElementId: item.translatableElementId,
        translatorId: item.translatorId,
        stringId: requireFirst(
          stringIds.slice(index, index + 1),
          "create translation string",
        ),
      })),
    },
  );

  return { translationIds };
};

beforeAll(async () => {
  testDb = await setupTestDB();
  initPermissionEngine({
    db: testDb.client,
    cache: new MemoryCacheStore(`translation-router-${randomUUID()}`),
    auditEnabled: false,
  });
  await executeCommand({ db: testDb.client }, ensureCoreRelationTypes, {});
  await executeCommand({ db: testDb.client }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });
  creatorUser = await executeCommand({ db: testDb.client }, createUser, {
    email: `translation-router-${randomUUID()}@example.com`,
    name: "Translation Router Tester",
  });
});

afterAll(async () => {
  await testDb?.cleanup();
});

describe("direct translation operation failures", () => {
  beforeEach(() => {
    mocks.ensureBranchWriteContext.mockClear();
  });

  it("persists one failure identity for the API error and reviewable change metadata", async () => {
    const fixture = await seedProjectElement("direct-write-failure-identity");
    await grantProjectRelation(
      getCreatorId(),
      fixture.projectId,
      "isolation_forced",
    );
    mocks.ensureBranchWriteContext.mockResolvedValueOnce(null);

    let caughtError: unknown;
    try {
      await call(
        create,
        {
          projectId: fixture.projectId,
          elementId: fixture.elementId,
          languageId: "zh-Hans",
          text: "Reviewable failure identity",
          createMemory: false,
        },
        { context: createContext() },
      );
    } catch (error) {
      caughtError = error;
    }

    const errorData = Reflect.get(caughtError as object, "data");
    const failure = Reflect.get(errorData as object, "operationFailure");
    const failureId = Reflect.get(failure as object, "id");
    expect(failure).toMatchObject({
      id: expect.any(String),
      code: "CAT_OPERATION_REVIEW_CHANGE_BLOCKED",
      blocker: "branch_write_context_unavailable",
    });
    if (typeof failureId !== "string") {
      throw new Error("Expected a persisted operation failure ID");
    }

    const persisted = await executeQuery(
      { db: testDb.client },
      getOperationFailure,
      {
        id: failureId,
        authorization: {
          viewerId: getCreatorId(),
          authorizedProjectIds: [fixture.projectId],
          systemAdmin: false,
        },
      },
    );
    expect(persisted?.id).toBe(failureId);

    const [pr] = await executeQuery({ db: testDb.client }, listPRs, {
      projectId: fixture.projectId,
      limit: 1,
      offset: 0,
    });
    expect(pr?.metadata).toMatchObject({
      operationFailure: { id: failureId },
    });
  });
});

describe("translation router branch-aware writes", () => {
  beforeEach(() => {
    mocks.interceptWrite.mockClear();
    mocks.runGraph.mockClear();
    mocks.runGraph.mockImplementation(writeTranslationsWithFakeGraph);
    mocks.selectFirstServiceImplementation.mockClear();
  });

  it("creates a reviewable change from main route writes when isolation is required", async () => {
    const fixture = await seedProjectElement("isolation-reviewable");
    await grantProjectRelation(
      getCreatorId(),
      fixture.projectId,
      "isolation_forced",
    );

    const result = await call(
      create,
      {
        projectId: fixture.projectId,
        elementId: fixture.elementId,
        languageId: "zh-Hans",
        text: "需要分支的译文",
        createMemory: false,
      },
      { context: createContext() },
    );

    const prs = await executeQuery({ db: testDb.client }, listPRs, {
      projectId: fixture.projectId,
      limit: 10,
      offset: 0,
    });
    expect(prs).toEqual([
      expect.objectContaining({
        status: "DRAFT",
        title: `Review translation for element ${fixture.elementId}`,
      }),
    ]);

    const pr = prs[0];
    if (pr === undefined) {
      throw new Error("Expected reviewable change pull request");
    }

    const diff = await executeQuery({ db: testDb.client }, getPRDiff, {
      prId: pr.id,
      entityType: "translation",
      limit: 10,
    });

    expect(diff).toEqual([
      expect.objectContaining({
        action: "CREATE",
        after: expect.objectContaining({
          translatableElementId: fixture.elementId,
          languageId: "zh-Hans",
          text: "需要分支的译文",
          sourceOperation: "translation.directWrite",
        }),
      }),
    ]);

    await expect(
      call(
        getAll,
        {
          elementId: fixture.elementId,
          languageId: "zh-Hans",
        },
        { context: createContext() },
      ),
    ).resolves.toEqual([]);

    expect(result?.writeMode).toBe("reviewable_change");
  });

  it("projects ReBAC denial from the direct write contract through the oRPC adapter", async () => {
    const fixture = await seedProjectElement("route-rebac-denied");
    const deniedUser = await executeCommand({ db: testDb.client }, createUser, {
      email: `route-rebac-denied-${randomUUID()}@example.com`,
      name: "Route ReBAC Denied",
    });

    let caughtError: unknown;
    try {
      await call(
        create,
        {
          projectId: fixture.projectId,
          elementId: fixture.elementId,
          languageId: "zh-Hans",
          text: "不应通过路由写入的 ReBAC 译文",
          createMemory: false,
        },
        { context: createContext({ user: deniedUser }) },
      );
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toMatchObject({
      code: "FORBIDDEN",
      message: "rebac_denied: project editor relationship is required",
      data: {
        operationContractErrorIdentifier: "relationship_denied",
        operationFailure: {
          id: expect.any(String),
          code: "CAT_OPERATION_RELATIONSHIP_DENIED",
          message: "rebac_denied: project editor relationship is required",
          severity: "ERROR",
          retryable: false,
          affectedResources: [
            {
              type: "PROJECT",
              id: fixture.projectId,
            },
            {
              type: "ELEMENT",
              id: String(fixture.elementId),
            },
          ],
          remediationHint:
            "Grant the project editor relationship or invoke as an authorized actor.",
          redactionBoundary: "PUBLIC",
        },
      },
    });

    if (typeof caughtError !== "object" || caughtError === null) {
      throw new Error("Expected route error object");
    }
    const projectedErrorData = Reflect.get(caughtError, "data");
    if (typeof projectedErrorData !== "object" || projectedErrorData === null) {
      throw new Error("Expected projected error data");
    }
    const projectedFailure = Reflect.get(
      projectedErrorData,
      "operationFailure",
    );
    if (
      typeof projectedFailure !== "object" ||
      projectedFailure === null ||
      typeof Reflect.get(projectedFailure, "id") !== "string"
    ) {
      throw new Error("Expected projected operation failure");
    }
    await expect(
      call(
        getAll,
        {
          elementId: fixture.elementId,
          languageId: "zh-Hans",
        },
        { context: createContext() },
      ),
    ).resolves.toEqual([]);
  });

  it("projects API-key scope denial before write-mode denial on direct route writes", async () => {
    const fixture = await seedProjectElement("route-api-scope-denied");
    await grantProjectRelation(
      getCreatorId(),
      fixture.projectId,
      "isolation_forced",
    );

    await expect(
      call(
        create,
        {
          projectId: fixture.projectId,
          elementId: fixture.elementId,
          languageId: "zh-Hans",
          text: "不应通过 API key 写入的译文",
          createMemory: false,
        },
        { context: createContext({ scopes: ["project:viewer"] }) },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "api_key_scope_denied: project:editor scope is required",
      data: {
        operationContractErrorIdentifier: "execution_denied",
        operationFailure: {
          authorizationDecision: "api_key_scope_denied",
        },
      },
    });

    await expect(
      call(
        getAll,
        {
          elementId: fixture.elementId,
          languageId: "zh-Hans",
        },
        { context: createContext() },
      ),
    ).resolves.toEqual([]);
  });

  it("allows API-key project editor scope when durable write mode permits direct writes", async () => {
    const fixture = await seedProjectElement("route-api-scope-allowed");

    await call(
      create,
      {
        projectId: fixture.projectId,
        elementId: fixture.elementId,
        languageId: "zh-Hans",
        text: "API key editor 译文",
        createMemory: false,
      },
      { context: createContext({ scopes: ["project:editor"] }) },
    );

    await expect(
      call(
        getAll,
        {
          elementId: fixture.elementId,
          languageId: "zh-Hans",
        },
        { context: createContext() },
      ),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "main",
          translatableElementId: fixture.elementId,
          text: "API key editor 译文",
          translatorId: getCreatorId(),
        }),
      ]),
    );
  });

  it("keeps direct translation create available through the oRPC transport route", async () => {
    const fixture = await seedProjectElement("route-direct-create");

    const result = await call(
      create,
      {
        projectId: fixture.projectId,
        elementId: fixture.elementId,
        languageId: "zh-Hans",
        text: "路由直写译文",
        createMemory: false,
      },
      { context: createContext() },
    );

    expect(result).toMatchObject({
      writeMode: "direct",
      translationIds: [expect.any(Number)],
    });

    await expect(
      call(
        getAll,
        {
          elementId: fixture.elementId,
          languageId: "zh-Hans",
        },
        { context: createContext() },
      ),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "main",
          translatableElementId: fixture.elementId,
          text: "路由直写译文",
          translatorId: getCreatorId(),
        }),
      ]),
    );
  });

  it("writes branch translations into the branch changeset with explicit projectId and branchId", async () => {
    const fixture = await seedProjectElement("branch-create");
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId: fixture.projectId,
      title: "Branch workspace",
      body: "Branch workspace fixture",
      authorId: getCreatorId(),
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
      authorId: getCreatorId(),
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

  it("projects branch translation write failures as Operation Failures", async () => {
    const fixture = await seedProjectElement("branch-write-fails");
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId: fixture.projectId,
      title: "Branch write failure",
      body: "Branch write failure fixture",
      authorId: getCreatorId(),
      reviewers: [],
      branchName: "feature/branch-write-fails",
    });
    await executeCommand({ db: testDb.client }, createChangeset, {
      projectId: fixture.projectId,
      branchId: pr.branchId,
      status: "PENDING",
    });
    mocks.interceptWrite.mockRejectedValueOnce(
      new Error("branch overlay write failed"),
    );

    await expect(
      call(
        create,
        {
          projectId: fixture.projectId,
          branchId: pr.branchId,
          elementId: fixture.elementId,
          languageId: "zh-Hans",
          text: "失败的分支译文",
          createMemory: false,
        },
        { context: createContext() },
      ),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Branch translation write failed",
      data: {
        operationContractErrorIdentifier: "operation_failed",
        operationFailure: {
          id: expect.any(String),
          code: "CAT_OPERATION_FAILED",
          message: "Branch translation write failed",
          affectedResources: [
            {
              type: "PROJECT",
              id: fixture.projectId,
            },
            {
              type: "ELEMENT",
              id: String(fixture.elementId),
            },
          ],
          blocker: "branch_translation_write_failed",
          redactionBoundary: "INTERNAL",
        },
      },
    });
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
      authorId: getCreatorId(),
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

  it("authorizes against the branch project before reporting branch project mismatch details", async () => {
    const hiddenBranchProject = await seedProjectElement(
      "hidden-branch-project",
      { grantEditor: false },
    );
    const requestedProject = await seedProjectElement(
      "requested-branch-project",
    );
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId: hiddenBranchProject.projectId,
      title: "Hidden branch project",
      body: "Hidden branch project fixture",
      authorId: getCreatorId(),
      reviewers: [],
      branchName: "feature/hidden-branch-project",
    });

    await expect(
      call(
        create,
        {
          projectId: requestedProject.projectId,
          branchId: pr.branchId,
          elementId: requestedProject.elementId,
          languageId: "zh-Hans",
          text: "不应泄露分支项目归属的译文",
          createMemory: false,
        },
        { context: createContext() },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "No editor permission on branch project",
    });
  });

  it("authorizes against the element project before reporting branch element mismatch details", async () => {
    const branchProject = await seedProjectElement("visible-branch-project");
    const hiddenElementProject = await seedProjectElement(
      "hidden-branch-element-project",
      { grantEditor: false },
    );
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId: branchProject.projectId,
      title: "Hidden element project",
      body: "Hidden element project fixture",
      authorId: getCreatorId(),
      reviewers: [],
      branchName: "feature/hidden-element-project",
    });

    await expect(
      call(
        create,
        {
          projectId: branchProject.projectId,
          branchId: pr.branchId,
          elementId: hiddenElementProject.elementId,
          languageId: "zh-Hans",
          text: "不应泄露元素项目归属的分支译文",
          createMemory: false,
        },
        { context: createContext() },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "No editor permission on element project",
    });
  });

  it("returns branch-only overlay translations as discriminated DTOs", async () => {
    const fixture = await seedProjectElement("branch-overlay");
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId: fixture.projectId,
      title: "Branch overlay read",
      body: "Branch overlay read fixture",
      authorId: getCreatorId(),
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
        translatorId: getCreatorId(),
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
      authorId: getCreatorId(),
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

  it("rejects branch batch auto-translation before creating a task or base write", async () => {
    const fixture = await seedProjectElement("branch-auto-translate");
    const pr = await executeCommand({ db: testDb.client }, createPR, {
      projectId: fixture.projectId,
      title: "Unsupported branch batch",
      body: "Branch batch must fail before scheduling.",
      authorId: getCreatorId(),
      reviewers: [],
      branchName: `feature/unsupported-${randomUUID()}`,
    });
    const taskQuery = {
      authorization: {
        viewerId: getCreatorId(),
        authorizedProjectIds: [fixture.projectId],
        systemAdmin: false,
      },
      projectId: fixture.projectId,
      pageSize: 100,
    };
    const before = await executeQuery(
      { db: testDb.client },
      listLocalizationTasks,
      taskQuery,
    );

    await expect(
      call(
        autoTranslate,
        {
          scope: {
            projectId: fixture.projectId,
            branchId: pr.branchId,
            contentNodeIds: [],
            elementIds: [fixture.elementId],
            sortMode: "structure",
          },
          languageId: "zh-Hans",
          minMemorySimilarity: 0.72,
          maxMemoryAmount: 3,
        },
        { context: createContext() },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Batch auto-translation does not support branch scopes.",
    });

    const after = await executeQuery(
      { db: testDb.client },
      listLocalizationTasks,
      taskQuery,
    );
    expect(after.items).toEqual(before.items);
    expect(mocks.runGraph).not.toHaveBeenCalled();
    expect(
      await call(
        getAll,
        { elementId: fixture.elementId, languageId: "zh-Hans" },
        { context: createContext() },
      ),
    ).toEqual([]);
  });

  it("rejects a resolved scope above the durable snapshot limit before creating a task", async () => {
    const fixture = await seedProjectElement("oversized-auto-translate");
    const taskQuery = {
      authorization: {
        viewerId: getCreatorId(),
        authorizedProjectIds: [fixture.projectId],
        systemAdmin: false,
      },
      projectId: fixture.projectId,
      pageSize: 100,
    };
    const before = await executeQuery(
      { db: testDb.client },
      listLocalizationTasks,
      taskQuery,
    );

    for (let batch = 0; batch < 10; batch += 1) {
      // oxlint-disable-next-line no-await-in-loop -- keep each insert below PostgreSQL's parameter limit
      await executeCommand({ db: testDb.client }, createElements, {
        data: Array.from({ length: 1_000 }, (_, index) => {
          const ordinal = batch * 1_000 + index + 1;
          return {
            projectId: fixture.projectId,
            primaryContentNodeId: fixture.fileId,
            importerId: "test-json",
            sourceRootRef: "root",
            sourceNodeRef: `oversized.item.${ordinal}`,
            stableSourceRef: `oversized-${randomUUID()}-${ordinal}`,
            stringId: fixture.sourceStringId,
            localOrder: ordinal,
          };
        }),
      });
    }

    await expect(
      call(
        autoTranslate,
        {
          scope: {
            projectId: fixture.projectId,
            contentNodeIds: [fixture.fileId],
            elementIds: [],
            sortMode: "structure",
          },
          languageId: "zh-Hans",
          minMemorySimilarity: 0.72,
          maxMemoryAmount: 3,
        },
        { context: createContext() },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "Batch auto-translation supports at most 10000 resolved elements.",
    });

    const after = await executeQuery(
      { db: testDb.client },
      listLocalizationTasks,
      taskQuery,
    );
    expect(after.items).toEqual(before.items);
    expect(mocks.runGraph).not.toHaveBeenCalled();
  }, 30_000);
});
