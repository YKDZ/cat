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
  getPRByNumber,
  getPRDiff,
  getLocalizationTask,
  listPRs,
  grantPermissionTuple,
  MemoryCacheStore,
} from "@cat/domain";
import { mergePRFull } from "@cat/operations";
import { getPermissionEngine, initPermissionEngine } from "@cat/permissions";
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
  firstOrGivenService: vi.fn(
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

import {
  directTranslationWriteContract,
  invokeOperationContract,
  type OperationInvocationContext,
} from "#/operation-contracts/index.ts";

import { create, getAll } from "./translation.ts";

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

const createOperationInvocationContext = (
  overrides: Partial<OperationInvocationContext> = {},
): OperationInvocationContext => ({
  db: overrides.db ?? testDb.client,
  actor: overrides.actor ?? {
    type: "user",
    id: getCreatorId(),
  },
  auth: overrides.auth ?? {
    subjectType: "user",
    subjectId: getCreatorId(),
    systemRoles: [],
    scopes: null,
  },
  pluginManager: overrides.pluginManager ?? new PluginManager("GLOBAL", ""),
  ...(overrides.signal === undefined ? {} : { signal: overrides.signal }),
});

const getErrorLocalizationTaskId = (error: unknown): string | null => {
  if (typeof error !== "object" || error === null) return null;
  const localizationTask = Reflect.get(error, "localizationTask");
  if (typeof localizationTask !== "object" || localizationTask === null) {
    return null;
  }
  const taskId = Reflect.get(localizationTask, "id");
  return typeof taskId === "string" ? taskId : null;
};

const getProjectedLocalizationTaskId = (error: unknown): string | null => {
  if (typeof error !== "object" || error === null) return null;
  const data = Reflect.get(error, "data");
  if (typeof data !== "object" || data === null) return null;
  const localizationTask = Reflect.get(data, "localizationTask");
  if (typeof localizationTask !== "object" || localizationTask === null) {
    return null;
  }
  const taskId = Reflect.get(localizationTask, "id");
  return typeof taskId === "string" ? taskId : null;
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

describe("direct translation write operation contract", () => {
  beforeEach(() => {
    mocks.interceptWrite.mockClear();
    mocks.runGraph.mockClear();
    mocks.runGraph.mockImplementation(writeTranslationsWithFakeGraph);
    mocks.firstOrGivenService.mockClear();
    mocks.ensureBranchWriteContext.mockClear();
  });

  it("writes a direct translation through the contract invocation interface", async () => {
    const fixture = await seedProjectElement("contract-direct-create");

    const result = await invokeOperationContract(
      directTranslationWriteContract,
      createOperationInvocationContext(),
      {
        projectId: fixture.projectId,
        elementId: fixture.elementId,
        languageId: "zh-Hans",
        text: "契约直写译文",
        createMemory: false,
      },
    );

    expect(result.translationIds).toHaveLength(1);
    expect(result.writeMode).toBe("direct");

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
          id: result.translationIds[0],
          translatableElementId: fixture.elementId,
          text: "契约直写译文",
          translatorId: getCreatorId(),
        }),
      ]),
    );
  });

  it("denies direct translation writes when ReBAC lacks the project editor relationship", async () => {
    const fixture = await seedProjectElement("contract-rebac-denied");
    const deniedUser = await executeCommand({ db: testDb.client }, createUser, {
      email: `contract-rebac-denied-${randomUUID()}@example.com`,
      name: "Contract ReBAC Denied",
    });

    let caughtError: unknown;
    try {
      await invokeOperationContract(
        directTranslationWriteContract,
        createOperationInvocationContext({
          actor: {
            type: "user",
            id: deniedUser.id,
          },
          auth: {
            subjectType: "user",
            subjectId: deniedUser.id,
            systemRoles: [],
            scopes: null,
          },
        }),
        {
          projectId: fixture.projectId,
          elementId: fixture.elementId,
          languageId: "zh-Hans",
          text: "不应写入的译文",
          createMemory: false,
        },
      );
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toMatchObject({
      identifier: "relationship_denied",
      message: "rebac_denied: project editor relationship is required",
      localizationTask: {
        status: "FAILED",
        operationContract: "translation.directWrite",
        actor: {
          type: "user",
          id: deniedUser.id,
        },
        affectedResources: [
          {
            type: "project",
            id: fixture.projectId,
          },
          {
            type: "translatable_element",
            id: String(fixture.elementId),
          },
        ],
        failure: {
          identifier: "relationship_denied",
          message: "rebac_denied: project editor relationship is required",
        },
      },
    });

    const localizationTaskId = getErrorLocalizationTaskId(caughtError);
    if (localizationTaskId === null) {
      throw new Error("Expected failed localization task on ReBAC error");
    }

    await expect(
      executeQuery({ db: testDb.client }, getLocalizationTask, {
        taskId: localizationTaskId,
      }),
    ).resolves.toMatchObject({
      id: localizationTaskId,
      status: "FAILED",
      failure: {
        identifier: "relationship_denied",
        message: "rebac_denied: project editor relationship is required",
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

  it("denies direct translation writes when the API key lacks project editor scope", async () => {
    const fixture = await seedProjectElement("contract-api-scope-denied");

    await expect(
      invokeOperationContract(
        directTranslationWriteContract,
        createOperationInvocationContext({
          auth: {
            subjectType: "user",
            subjectId: getCreatorId(),
            systemRoles: [],
            scopes: ["project:viewer"],
          },
        }),
        {
          projectId: fixture.projectId,
          elementId: fixture.elementId,
          languageId: "zh-Hans",
          text: "不应写入的 API key 译文",
          createMemory: false,
        },
      ),
    ).rejects.toMatchObject({
      identifier: "execution_denied",
      message: "api_key_scope_denied: project:editor scope is required",
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

  it("records a failed localization task when the requested element is not found", async () => {
    const requestedProjectId = randomUUID();
    const missingElementId = 2_147_483_647;

    let caughtError: unknown;
    try {
      await invokeOperationContract(
        directTranslationWriteContract,
        createOperationInvocationContext(),
        {
          projectId: requestedProjectId,
          elementId: missingElementId,
          languageId: "zh-Hans",
          text: "找不到元素的译文",
          createMemory: false,
        },
      );
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toMatchObject({
      identifier: "not_found",
      message: `Element ${missingElementId} not found`,
      localizationTask: {
        status: "FAILED",
        operationContract: "translation.directWrite",
        affectedResources: [
          {
            type: "project",
            id: requestedProjectId,
          },
          {
            type: "translatable_element",
            id: String(missingElementId),
          },
        ],
        failure: {
          identifier: "not_found",
          message: `Element ${missingElementId} not found`,
        },
      },
    });

    const localizationTaskId = getErrorLocalizationTaskId(caughtError);
    if (localizationTaskId === null) {
      throw new Error("Expected failed localization task on not-found error");
    }

    await expect(
      executeQuery({ db: testDb.client }, getLocalizationTask, {
        taskId: localizationTaskId,
      }),
    ).resolves.toMatchObject({
      id: localizationTaskId,
      status: "FAILED",
      failure: {
        identifier: "not_found",
        message: `Element ${missingElementId} not found`,
      },
    });
  });

  it("records a failed localization task when input project and element project mismatch", async () => {
    const requestedProject = await seedProjectElement(
      "contract-invalid-requested-project",
    );
    const elementProject = await seedProjectElement(
      "contract-invalid-element-project",
    );

    let caughtError: unknown;
    try {
      await invokeOperationContract(
        directTranslationWriteContract,
        createOperationInvocationContext(),
        {
          projectId: requestedProject.projectId,
          elementId: elementProject.elementId,
          languageId: "zh-Hans",
          text: "项目不匹配的译文",
          createMemory: false,
        },
      );
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toMatchObject({
      identifier: "invalid_input",
      message: `Element ${elementProject.elementId} does not belong to project ${requestedProject.projectId}`,
      localizationTask: {
        status: "FAILED",
        operationContract: "translation.directWrite",
        affectedResources: [
          {
            type: "project",
            id: requestedProject.projectId,
          },
          {
            type: "translatable_element",
            id: String(elementProject.elementId),
          },
        ],
        failure: {
          identifier: "invalid_input",
          message: `Element ${elementProject.elementId} does not belong to project ${requestedProject.projectId}`,
        },
      },
    });

    const localizationTaskId = getErrorLocalizationTaskId(caughtError);
    if (localizationTaskId === null) {
      throw new Error("Expected failed localization task on invalid input");
    }

    await expect(
      executeQuery({ db: testDb.client }, getLocalizationTask, {
        taskId: localizationTaskId,
      }),
    ).resolves.toMatchObject({
      id: localizationTaskId,
      status: "FAILED",
      failure: {
        identifier: "invalid_input",
        message: `Element ${elementProject.elementId} does not belong to project ${requestedProject.projectId}`,
      },
    });

    await expect(
      call(
        getAll,
        {
          elementId: elementProject.elementId,
          languageId: "zh-Hans",
        },
        { context: createContext() },
      ),
    ).resolves.toEqual([]);
  });

  it("records a failed localization task when execution authorization denies the invocation", async () => {
    const fixture = await seedProjectElement("contract-task-failed");

    let caughtError: unknown;
    try {
      await invokeOperationContract(
        directTranslationWriteContract,
        createOperationInvocationContext({
          auth: {
            subjectType: "user",
            subjectId: getCreatorId(),
            systemRoles: [],
            scopes: ["project:viewer"],
          },
        }),
        {
          projectId: fixture.projectId,
          elementId: fixture.elementId,
          languageId: "zh-Hans",
          text: "不应写入但应记录任务的译文",
          createMemory: false,
        },
      );
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toMatchObject({
      identifier: "execution_denied",
      localizationTask: {
        status: "FAILED",
        operationContract: "translation.directWrite",
        actor: {
          type: "user",
          id: getCreatorId(),
        },
        affectedResources: [
          {
            type: "project",
            id: fixture.projectId,
          },
          {
            type: "translatable_element",
            id: String(fixture.elementId),
          },
        ],
        failure: {
          identifier: "execution_denied",
          message: "api_key_scope_denied: project:editor scope is required",
        },
      },
    });

    const localizationTaskId = getErrorLocalizationTaskId(caughtError);
    if (localizationTaskId === null) {
      throw new Error("Expected failed localization task on contract error");
    }

    const task = await executeQuery(
      { db: testDb.client },
      getLocalizationTask,
      {
        taskId: localizationTaskId,
      },
    );

    expect(task).toEqual(
      expect.objectContaining({
        id: localizationTaskId,
        status: "FAILED",
        operationContract: "translation.directWrite",
        failure: expect.objectContaining({
          identifier: "execution_denied",
          message: "api_key_scope_denied: project:editor scope is required",
          operationFailure: expect.objectContaining({
            code: "CAT_OPERATION_EXECUTION_DENIED",
            taskId: localizationTaskId,
          }),
        }),
      }),
    );
  });

  it("records a failed localization task when the direct write fails after task creation", async () => {
    const fixture = await seedProjectElement("contract-task-workflow-failed");
    mocks.runGraph.mockRejectedValueOnce(new Error("workflow write failed"));

    let caughtError: unknown;
    try {
      await invokeOperationContract(
        directTranslationWriteContract,
        createOperationInvocationContext(),
        {
          projectId: fixture.projectId,
          elementId: fixture.elementId,
          languageId: "zh-Hans",
          text: "失败后不应写入的译文",
          createMemory: false,
        },
      );
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toMatchObject({
      identifier: "operation_failed",
      message: "Translation operation failed",
      localizationTask: {
        status: "FAILED",
        operationContract: "translation.directWrite",
        affectedResources: [
          {
            type: "project",
            id: fixture.projectId,
          },
          {
            type: "translatable_element",
            id: String(fixture.elementId),
          },
        ],
        failure: {
          identifier: "operation_failed",
          message: "Translation operation failed",
        },
      },
    });

    const localizationTaskId = getErrorLocalizationTaskId(caughtError);
    if (localizationTaskId === null) {
      throw new Error("Expected failed localization task on write failure");
    }

    await expect(
      executeQuery({ db: testDb.client }, getLocalizationTask, {
        taskId: localizationTaskId,
      }),
    ).resolves.toMatchObject({
      id: localizationTaskId,
      status: "FAILED",
      failure: {
        identifier: "operation_failed",
        message: "Translation operation failed",
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

  it("records missing service capability as a distinct Operation Failure", async () => {
    const fixture = await seedProjectElement("contract-missing-capability");
    mocks.firstOrGivenService.mockReturnValueOnce(null);

    let caughtError: unknown;
    try {
      await invokeOperationContract(
        directTranslationWriteContract,
        createOperationInvocationContext(),
        {
          projectId: fixture.projectId,
          elementId: fixture.elementId,
          languageId: "zh-Hans",
          text: "缺少能力时不应写入的译文",
          createMemory: false,
        },
      );
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toMatchObject({
      identifier: "missing_capability",
      operationFailure: {
        id: expect.any(String),
        code: "CAT_OPERATION_MISSING_CAPABILITY",
        message: "No vector storage provider available",
        severity: "error",
        retryable: true,
        redactionBoundary: "public",
        missingCapability: "VECTOR_STORAGE",
      },
      localizationTask: {
        status: "BLOCKED",
        failure: {
          identifier: "missing_capability",
          message: "No vector storage provider available",
          operationFailure: {
            id: expect.any(String),
            code: "CAT_OPERATION_MISSING_CAPABILITY",
          },
        },
      },
    });
  });

  it("records missing text vectorizer capability as a distinct Operation Failure decision", async () => {
    const fixture = await seedProjectElement("contract-missing-vectorizer");
    mocks.firstOrGivenService
      .mockReturnValueOnce({ id: 1 })
      .mockReturnValueOnce(null);

    await expect(
      invokeOperationContract(
        directTranslationWriteContract,
        createOperationInvocationContext(),
        {
          projectId: fixture.projectId,
          elementId: fixture.elementId,
          languageId: "zh-Hans",
          text: "缺少向量化能力时不应写入的译文",
          createMemory: false,
        },
      ),
    ).rejects.toMatchObject({
      identifier: "missing_capability",
      operationFailure: {
        code: "CAT_OPERATION_MISSING_CAPABILITY",
        message: "No text vectorizer capability available",
        missingCapability: "TEXT_VECTORIZER",
      },
      localizationTask: {
        status: "BLOCKED",
        failure: {
          operationFailure: {
            missingCapability: "TEXT_VECTORIZER",
          },
        },
      },
    });
  });

  it("authorizes against the element project before reporting project mismatch details", async () => {
    const requestedProject = await seedProjectElement(
      "contract-requested-project",
    );
    const hiddenElementProject = await seedProjectElement(
      "contract-hidden-element-project",
      { grantEditor: false },
    );

    await expect(
      invokeOperationContract(
        directTranslationWriteContract,
        createOperationInvocationContext(),
        {
          projectId: requestedProject.projectId,
          elementId: hiddenElementProject.elementId,
          languageId: "zh-Hans",
          text: "不应泄露项目归属的译文",
          createMemory: false,
        },
      ),
    ).rejects.toMatchObject({
      identifier: "relationship_denied",
      message: "rebac_denied: project editor relationship is required",
    });
  });

  it("fails without creating review entries when write-mode resolution returns no access", async () => {
    const fixture = await seedProjectElement("contract-write-mode-no-access");
    const permissionEngine = getPermissionEngine();
    const originalCheck = permissionEngine.check;
    let editorChecks = 0;
    const checkSpy = vi
      .spyOn(permissionEngine, "check")
      .mockImplementation(async (...args) => {
        const [, object, relation] = args;
        if (
          object.type === "project" &&
          object.id === fixture.projectId &&
          relation === "editor"
        ) {
          editorChecks += 1;
          return editorChecks === 1;
        }
        return await originalCheck(...args);
      });

    try {
      await expect(
        invokeOperationContract(
          directTranslationWriteContract,
          createOperationInvocationContext(),
          {
            projectId: fixture.projectId,
            elementId: fixture.elementId,
            languageId: "zh-Hans",
            text: "不应创建待审校变更的译文",
            createMemory: false,
          },
        ),
      ).rejects.toMatchObject({
        identifier: "execution_denied",
        message: "write_mode_denied: project editor access is required",
        operationFailure: {
          authorizationDecision: "write_mode_denied",
        },
      });
    } finally {
      checkSpy.mockRestore();
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

    await expect(
      executeQuery({ db: testDb.client }, listPRs, {
        projectId: fixture.projectId,
        limit: 10,
        offset: 0,
      }),
    ).resolves.toEqual([]);
  });

  it("keeps inspection-required writes out of mainline translations", async () => {
    const fixture = await seedProjectElement("contract-write-mode-inspected");
    await grantProjectRelation(
      getCreatorId(),
      fixture.projectId,
      "isolation_forced",
    );

    const result = await invokeOperationContract(
      directTranslationWriteContract,
      createOperationInvocationContext({
        auth: {
          subjectType: "user",
          subjectId: getCreatorId(),
          systemRoles: [],
          scopes: ["project:*"],
        },
      }),
      {
        projectId: fixture.projectId,
        elementId: fixture.elementId,
        languageId: "zh-Hans",
        text: "不应直写的隔离译文",
        createMemory: false,
      },
    );

    expect(result.writeMode).toBe("reviewable_change");
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

  it("creates a reviewable change when write-mode limits require inspection", async () => {
    const fixture = await seedProjectElement("contract-reviewable-change");
    await grantProjectRelation(
      getCreatorId(),
      fixture.projectId,
      "isolation_forced",
    );

    const result = await invokeOperationContract(
      directTranslationWriteContract,
      createOperationInvocationContext({
        auth: {
          subjectType: "user",
          subjectId: getCreatorId(),
          systemRoles: [],
          scopes: ["project:*"],
        },
      }),
      {
        projectId: fixture.projectId,
        elementId: fixture.elementId,
        languageId: "zh-Hans",
        text: "待审校的契约译文",
        createMemory: false,
      },
    );

    expect(result).toMatchObject({
      writeMode: "reviewable_change",
      reviewableChange: {
        sourceOperation: "translation.directWrite",
        pullRequestId: expect.any(Number),
        pullRequestNumber: expect.any(Number),
        status: "DRAFT",
        affectedTranslationUnit: {
          projectId: fixture.projectId,
          elementId: fixture.elementId,
          languageId: "zh-Hans",
        },
      },
    });
    expect(result.translationIds).toEqual([]);

    if (result.reviewableChange === undefined) {
      throw new Error("Expected reviewable change metadata");
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

    const entries = await executeQuery({ db: testDb.client }, getPRDiff, {
      prId: result.reviewableChange.pullRequestId,
      entityType: "translation",
      limit: 10,
    });

    expect(entries).toEqual([
      expect.objectContaining({
        action: "CREATE",
        after: expect.objectContaining({
          translatableElementId: fixture.elementId,
          languageId: "zh-Hans",
          text: "待审校的契约译文",
          translatorId: getCreatorId(),
          sourceOperation: "translation.directWrite",
        }),
      }),
    ]);
  });

  it("records a completed localization task for a successful reviewable translation invocation", async () => {
    const fixture = await seedProjectElement("contract-task-completed");
    await grantProjectRelation(
      getCreatorId(),
      fixture.projectId,
      "isolation_forced",
    );

    const result = await invokeOperationContract(
      directTranslationWriteContract,
      createOperationInvocationContext({
        auth: {
          subjectType: "user",
          subjectId: getCreatorId(),
          systemRoles: [],
          scopes: ["project:*"],
        },
      }),
      {
        projectId: fixture.projectId,
        elementId: fixture.elementId,
        languageId: "zh-Hans",
        text: "带任务记录的待审校译文",
        createMemory: false,
      },
    );

    expect(result.localizationTask).toMatchObject({
      status: "COMPLETED",
      operationContract: "translation.directWrite",
      actor: {
        type: "user",
        id: getCreatorId(),
      },
      affectedResources: [
        {
          type: "project",
          id: fixture.projectId,
        },
        {
          type: "translatable_element",
          id: String(fixture.elementId),
        },
      ],
    });

    if (result.reviewableChange === undefined) {
      throw new Error("Expected reviewable change metadata");
    }

    expect(result.localizationTask.relatedPullRequest).toEqual({
      id: result.reviewableChange.pullRequestId,
      number: result.reviewableChange.pullRequestNumber,
    });
    expect(result.localizationTask.relatedReviewableChange).toEqual({
      sourceOperation: "translation.directWrite",
      pullRequestId: result.reviewableChange.pullRequestId,
    });

    const task = await executeQuery(
      { db: testDb.client },
      getLocalizationTask,
      {
        taskId: result.localizationTask.id,
      },
    );

    expect(task).toEqual(result.localizationTask);
  });

  it("links a blocked reviewable change and localization task to the same Operation Failure", async () => {
    const fixture = await seedProjectElement("contract-reviewable-blocked");
    await grantProjectRelation(
      getCreatorId(),
      fixture.projectId,
      "isolation_forced",
    );
    mocks.ensureBranchWriteContext.mockResolvedValueOnce(null);

    let caughtError: unknown;
    try {
      await invokeOperationContract(
        directTranslationWriteContract,
        createOperationInvocationContext({
          auth: {
            subjectType: "user",
            subjectId: getCreatorId(),
            systemRoles: [],
            scopes: ["project:*"],
          },
        }),
        {
          projectId: fixture.projectId,
          elementId: fixture.elementId,
          languageId: "zh-Hans",
          text: "无法写入待审校分支的译文",
          createMemory: false,
        },
      );
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toMatchObject({
      identifier: "review_change_blocked",
      operationFailure: {
        id: expect.any(String),
        code: "CAT_OPERATION_REVIEW_CHANGE_BLOCKED",
        severity: "error",
        retryable: false,
        reviewBlocker: "branch_write_context_unavailable",
      },
      localizationTask: {
        status: "BLOCKED",
        relatedReviewableChange: {
          sourceOperation: "translation.directWrite",
          pullRequestId: expect.any(Number),
        },
        relatedPullRequest: {
          id: expect.any(Number),
          number: expect.any(Number),
        },
        failure: {
          operationFailure: {
            id: expect.any(String),
            code: "CAT_OPERATION_REVIEW_CHANGE_BLOCKED",
            reviewBlocker: "branch_write_context_unavailable",
          },
        },
      },
    });

    if (typeof caughtError !== "object" || caughtError === null) {
      throw new Error("Expected reviewable change blocker error");
    }
    const operationFailure = Reflect.get(caughtError, "operationFailure");
    const localizationTask = Reflect.get(caughtError, "localizationTask");
    if (
      typeof operationFailure !== "object" ||
      operationFailure === null ||
      typeof localizationTask !== "object" ||
      localizationTask === null
    ) {
      throw new Error("Expected operation failure and localization task");
    }
    const failureId = Reflect.get(operationFailure, "id");
    const relatedPullRequest = Reflect.get(
      localizationTask,
      "relatedPullRequest",
    );
    if (
      typeof failureId !== "string" ||
      typeof relatedPullRequest !== "object" ||
      relatedPullRequest === null ||
      typeof Reflect.get(relatedPullRequest, "number") !== "number"
    ) {
      throw new Error("Expected failure id and related pull request");
    }

    const pr = await executeQuery({ db: testDb.client }, getPRByNumber, {
      projectId: fixture.projectId,
      number: Reflect.get(relatedPullRequest, "number"),
    });
    expect(pr?.metadata).toMatchObject({
      sourceOperation: "translation.directWrite",
      operationFailure: {
        id: failureId,
        code: "CAT_OPERATION_REVIEW_CHANGE_BLOCKED",
      },
    });
  });

  it("keeps post-PR reviewable write failures linked across API task and PR metadata", async () => {
    const fixture = await seedProjectElement("contract-reviewable-write-fails");
    await grantProjectRelation(
      getCreatorId(),
      fixture.projectId,
      "isolation_forced",
    );
    mocks.interceptWrite.mockRejectedValueOnce(
      new Error("reviewable change write failed"),
    );

    let caughtError: unknown;
    try {
      await call(
        create,
        {
          projectId: fixture.projectId,
          elementId: fixture.elementId,
          languageId: "zh-Hans",
          text: "写入待审校分支失败的译文",
          createMemory: false,
        },
        {
          context: createContext({
            scopes: ["project:*"],
          }),
        },
      );
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      data: {
        operationContractErrorIdentifier: "operation_failed",
        operationFailure: {
          id: expect.any(String),
          code: "CAT_OPERATION_FAILED",
          reviewBlocker: "reviewable_change_write_failed",
        },
        localizationTask: {
          status: "FAILED",
          relatedReviewableChange: {
            sourceOperation: "translation.directWrite",
            pullRequestId: expect.any(Number),
          },
          relatedPullRequest: {
            id: expect.any(Number),
            number: expect.any(Number),
          },
          failure: {
            operationFailure: {
              id: expect.any(String),
              code: "CAT_OPERATION_FAILED",
              reviewBlocker: "reviewable_change_write_failed",
            },
          },
        },
      },
    });

    if (typeof caughtError !== "object" || caughtError === null) {
      throw new Error("Expected projected reviewable write failure");
    }
    const errorData = Reflect.get(caughtError, "data");
    if (typeof errorData !== "object" || errorData === null) {
      throw new Error("Expected projected error data");
    }
    const operationFailure = Reflect.get(errorData, "operationFailure");
    const localizationTask = Reflect.get(errorData, "localizationTask");
    if (
      typeof operationFailure !== "object" ||
      operationFailure === null ||
      typeof localizationTask !== "object" ||
      localizationTask === null
    ) {
      throw new Error("Expected operation failure and localization task");
    }
    const failureId = Reflect.get(operationFailure, "id");
    const taskId = Reflect.get(localizationTask, "id");
    const relatedPullRequest = Reflect.get(
      localizationTask,
      "relatedPullRequest",
    );
    if (
      typeof failureId !== "string" ||
      typeof taskId !== "string" ||
      typeof relatedPullRequest !== "object" ||
      relatedPullRequest === null ||
      typeof Reflect.get(relatedPullRequest, "number") !== "number"
    ) {
      throw new Error("Expected failure id task id and related pull request");
    }

    await expect(
      executeQuery({ db: testDb.client }, getLocalizationTask, { taskId }),
    ).resolves.toMatchObject({
      id: taskId,
      status: "FAILED",
      relatedPullRequest: {
        id: Reflect.get(relatedPullRequest, "id"),
        number: Reflect.get(relatedPullRequest, "number"),
      },
      failure: {
        operationFailure: {
          id: failureId,
          code: "CAT_OPERATION_FAILED",
          reviewBlocker: "reviewable_change_write_failed",
        },
      },
    });

    const pr = await executeQuery({ db: testDb.client }, getPRByNumber, {
      projectId: fixture.projectId,
      number: Reflect.get(relatedPullRequest, "number"),
    });
    expect(pr?.metadata).toMatchObject({
      sourceOperation: "translation.directWrite",
      operationFailure: {
        id: failureId,
        code: "CAT_OPERATION_FAILED",
      },
      localizationTaskId: taskId,
    });
  });

  it("keeps reviewable translation changes off mainline until their pull request is merged", async () => {
    const fixture = await seedProjectElement("contract-reviewable-merge");
    await grantProjectRelation(
      getCreatorId(),
      fixture.projectId,
      "isolation_forced",
    );

    const result = await invokeOperationContract(
      directTranslationWriteContract,
      createOperationInvocationContext({
        auth: {
          subjectType: "user",
          subjectId: getCreatorId(),
          systemRoles: [],
          scopes: ["project:*"],
        },
      }),
      {
        projectId: fixture.projectId,
        elementId: fixture.elementId,
        languageId: "zh-Hans",
        text: "合并后出现的契约译文",
        createMemory: false,
      },
    );

    expect(result.writeMode).toBe("reviewable_change");
    if (result.reviewableChange === undefined) {
      throw new Error("Expected reviewable change metadata");
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

    const diff = await executeQuery({ db: testDb.client }, getPRDiff, {
      prId: result.reviewableChange.pullRequestId,
      entityType: "translation",
      limit: 10,
    });

    expect(diff).toEqual([
      expect.objectContaining({
        action: "CREATE",
        after: expect.objectContaining({
          translatableElementId: fixture.elementId,
          languageId: "zh-Hans",
          text: "合并后出现的契约译文",
          translatorId: getCreatorId(),
        }),
      }),
    ]);

    const pr = await executeQuery({ db: testDb.client }, getPRByNumber, {
      projectId: fixture.projectId,
      number: result.reviewableChange.pullRequestNumber,
    });
    if (pr === null) {
      throw new Error("Expected reviewable change pull request");
    }

    const mergeResult = await mergePRFull(
      { db: testDb.client },
      {
        prExternalId: pr.externalId,
        mergedBy: getCreatorId(),
      },
    );

    expect(mergeResult.success).toBe(true);
    expect(mergeResult.hasConflicts).toBe(false);

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
          text: "合并后出现的契约译文",
          translatorId: getCreatorId(),
        }),
      ]),
    );
  });
});

describe("translation router branch-aware writes", () => {
  beforeEach(() => {
    mocks.interceptWrite.mockClear();
    mocks.runGraph.mockClear();
    mocks.runGraph.mockImplementation(writeTranslationsWithFakeGraph);
    mocks.firstOrGivenService.mockClear();
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

    expect(result?.localizationTask).toMatchObject({
      status: "COMPLETED",
      operationContract: "translation.directWrite",
      relatedPullRequest: {
        number: expect.any(Number),
      },
    });

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

    if (result === undefined) {
      throw new Error("Expected route result with localization task");
    }

    await expect(
      executeQuery({ db: testDb.client }, getLocalizationTask, {
        taskId: result.localizationTask.id,
      }),
    ).resolves.toEqual(result.localizationTask);
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
          severity: "error",
          retryable: false,
          affectedResources: [
            {
              type: "project",
              id: fixture.projectId,
            },
            {
              type: "translatable_element",
              id: String(fixture.elementId),
            },
          ],
          remediationHint:
            "Grant the project editor relationship or invoke as an authorized actor.",
          taskId: expect.any(String),
          redactionBoundary: "public",
        },
        localizationTask: {
          status: "FAILED",
          operationContract: "translation.directWrite",
          failure: {
            identifier: "relationship_denied",
            message: "rebac_denied: project editor relationship is required",
            operationFailure: {
              id: expect.any(String),
              code: "CAT_OPERATION_RELATIONSHIP_DENIED",
            },
          },
        },
      },
    });

    const localizationTaskId = getProjectedLocalizationTaskId(caughtError);
    if (localizationTaskId === null) {
      throw new Error("Expected projected localization task on route error");
    }

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
    const projectedFailureId = Reflect.get(projectedFailure, "id");

    await expect(
      executeQuery({ db: testDb.client }, getLocalizationTask, {
        taskId: localizationTaskId,
      }),
    ).resolves.toMatchObject({
      id: localizationTaskId,
      status: "FAILED",
      failure: {
        identifier: "relationship_denied",
        message: "rebac_denied: project editor relationship is required",
        operationFailure: {
          id: projectedFailureId,
          code: "CAT_OPERATION_RELATIONSHIP_DENIED",
          retryable: false,
          taskId: localizationTaskId,
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

    const result = await call(
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

    expect(result?.localizationTask).toMatchObject({
      status: "COMPLETED",
      operationContract: "translation.directWrite",
      affectedResources: expect.arrayContaining([
        {
          type: "project",
          id: fixture.projectId,
        },
        {
          type: "translatable_element",
          id: String(fixture.elementId),
        },
      ]),
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
      localizationTask: {
        status: "COMPLETED",
        operationContract: "translation.directWrite",
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
              type: "project",
              id: fixture.projectId,
            },
            {
              type: "translatable_element",
              id: String(fixture.elementId),
            },
          ],
          reviewBlocker: "branch_translation_write_failed",
          redactionBoundary: "internal",
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
});
