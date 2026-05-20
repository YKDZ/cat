import * as domain from "@cat/domain";
import {
  addChangesetEntry,
  createBranch,
  createChangeset,
  createContentNodeUnderParent,
  createElements,
  createProject,
  createRootContentNode,
  createUser,
  createVectorizedStrings,
  ensureLanguages,
  ensureCoreRelationTypes,
  executeCommand,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import {
  createAuthedTestContext,
  setupTestDB,
  type TestDB,
} from "@cat/test-utils";
import {
  EditorOverlayContentNodeRowSchema,
  EditorOverlayContentRelationRowSchema,
} from "@cat/vcs";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import type { Context } from "@/utils/context";

const { permissionCheck } = vi.hoisted(() => ({
  permissionCheck: vi.fn(async () => true),
}));

vi.mock("@cat/permissions", () => ({
  getPermissionEngine: () => ({ check: permissionCheck }),
  determineWriteMode: async () => "direct",
  loadUserSystemRoles: async () => [],
}));

import {
  getElementPageIndex,
  listContentNodes,
  listElements,
  resolveScope,
} from "./editor.ts";

let testDb: TestDB;
let creatorId: string;

type ProcedureInternal = {
  middlewares: Array<
    (
      options: {
        context: Context;
        next: (nextOptions?: { context?: Record<string, unknown> }) => Promise<{
          output: unknown;
          context: Record<string, unknown>;
        }>;
        errors: Record<string, never>;
        path: string[];
        signal: AbortSignal | undefined;
      },
      input: unknown,
      outputFn: () => void,
    ) => Promise<{ output: unknown; context: Record<string, unknown> }>
  >;
  handler: (options: {
    context: Context;
    input: unknown;
    errors: Record<string, never>;
    path: string[];
    signal: AbortSignal | undefined;
  }) => Promise<unknown>;
};

const noop = (): undefined => undefined;

const isProcedureInternal = (value: unknown): value is ProcedureInternal => {
  if (typeof value !== "object" || value === null) return false;
  const middlewares = Reflect.get(value, "middlewares");
  const handler = Reflect.get(value, "handler");

  return Array.isArray(middlewares) && typeof handler === "function";
};

const getProcedureInternal = (procedure: unknown): ProcedureInternal => {
  if (typeof procedure !== "object" || procedure === null) {
    throw new TypeError("Expected an oRPC procedure object");
  }

  const internal = Reflect.get(procedure, "~orpc");
  if (!isProcedureInternal(internal)) {
    throw new TypeError("Expected oRPC internals on the procedure");
  }

  return internal;
};

const invokeProcedure = async <TOutput>(
  procedure: unknown,
  context: Context,
  input: unknown,
): Promise<TOutput> => {
  const internal = getProcedureInternal(procedure);

  const run = async (
    index: number,
    currentContext: Context,
  ): Promise<unknown> => {
    const middleware = internal.middlewares[index];
    if (!middleware) {
      return await internal.handler({
        context: currentContext,
        input,
        errors: {},
        path: [],
        signal: undefined,
      });
    }

    const result = await middleware(
      {
        context: currentContext,
        next: async (nextOptions) => ({
          output: await run(index + 1, {
            ...currentContext,
            ...(nextOptions?.context ?? {}),
          } as Context),
          context: nextOptions?.context ?? {},
        }),
        errors: {},
        path: [],
        signal: undefined,
      },
      input,
      noop,
    );

    return result.output;
  };

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- helper is the narrow boundary for invoking oRPC procedures in tests
  return (await run(0, context)) as TOutput;
};

const createMockContext = (
  db: TestDB,
  options?: { headerBranchId?: string },
): Context => {
  const base = createAuthedTestContext(
    {
      id: creatorId,
      email: "editor-router@test.local",
      name: "Editor Router Tester",
      emailVerified: true,
      avatarFileId: null,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    },
    {
      drizzleDB: db,
      pluginManager: new PluginManager("GLOBAL", ""),
      helpers: {
        setCookie: noop,
        delCookie: noop,
        getCookie: (name) => (name === "csrfToken" ? "csrf-token" : null),
        getQueryParam: () => undefined,
        getReqHeader: (name) => {
          if (name === "x-csrf-token") return "csrf-token";
          if (name === "x-branch-id") return options?.headerBranchId;
          return undefined;
        },
        setResHeader: noop,
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
    isSSR: false,
    isWebSocket: false,
    requestSignal: new AbortController().signal,
  };
};

const insertStrings = async (rows: { value: string; languageId: string }[]) => {
  const ids = await executeCommand(
    { db: testDb.client },
    createVectorizedStrings,
    {
      data: rows.map((row) => ({
        text: row.value,
        languageId: row.languageId,
      })),
    },
  );

  return rows.map((row, index) => ({
    id: ids[index],
    value: row.value,
  }));
};

const seedFixture = async () => {
  const relationTypeIds = await executeCommand(
    { db: testDb.client },
    ensureCoreRelationTypes,
    {},
  );

  const project = await executeCommand({ db: testDb.client }, createProject, {
    name: "editor-router-main",
    description: null,
    creatorId,
  });
  const root = await executeCommand(
    { db: testDb.client },
    createRootContentNode,
    { projectId: project.id, creatorId },
  );
  const dir = await executeCommand(
    { db: testDb.client },
    createContentNodeUnderParent,
    {
      projectId: project.id,
      creatorId,
      parentContentNodeId: root.id,
      kind: "DIRECTORY",
      displayLabel: "src",
      importerId: "test",
      sourceRootRef: "root",
      stableSourceNodeRef: "src",
      exportRole: "DIRECTORY",
      boundaryType: "DIRECTORY",
      localOrder: 0,
    },
  );
  const fileA = await executeCommand(
    { db: testDb.client },
    createContentNodeUnderParent,
    {
      projectId: project.id,
      creatorId,
      parentContentNodeId: dir.id,
      kind: "FILE",
      displayLabel: "a.json",
      importerId: "test-json",
      sourceRootRef: "root",
      stableSourceNodeRef: "a.json",
      exportRole: "FILE",
      boundaryType: "FILE",
      localOrder: 0,
    },
  );
  const fileB = await executeCommand(
    { db: testDb.client },
    createContentNodeUnderParent,
    {
      projectId: project.id,
      creatorId,
      parentContentNodeId: dir.id,
      kind: "FILE",
      displayLabel: "b.json",
      importerId: "test-json",
      sourceRootRef: "root",
      stableSourceNodeRef: "b.json",
      exportRole: "FILE",
      boundaryType: "FILE",
      localOrder: 1,
    },
  );

  const otherProject = await executeCommand(
    { db: testDb.client },
    createProject,
    {
      name: "editor-router-other",
      description: null,
      creatorId,
    },
  );
  const otherRoot = await executeCommand(
    { db: testDb.client },
    createRootContentNode,
    { projectId: otherProject.id, creatorId },
  );
  const otherFile = await executeCommand(
    { db: testDb.client },
    createContentNodeUnderParent,
    {
      projectId: otherProject.id,
      creatorId,
      parentContentNodeId: otherRoot.id,
      kind: "FILE",
      displayLabel: "other.json",
      importerId: "test-json",
      sourceRootRef: "root",
      stableSourceNodeRef: "other.json",
      exportRole: "FILE",
      boundaryType: "FILE",
      localOrder: 0,
    },
  );

  const sourceStrings = await insertStrings([
    { value: "Apple", languageId: "en" },
    { value: "Banana", languageId: "en" },
    { value: "Kiwi", languageId: "en" },
  ]);
  const sourceIdByValue = new Map(
    sourceStrings.map((item) => [item.value, item.id]),
  );

  const elementIds = await executeCommand(
    { db: testDb.client },
    createElements,
    {
      data: [
        {
          projectId: project.id,
          primaryContentNodeId: fileA.id,
          importerId: "test-json",
          sourceRootRef: "root",
          sourceNodeRef: "a.json",
          stableSourceRef: `apple-${Date.now()}`,
          stringId: sourceIdByValue.get("Apple")!,
          localOrder: 0,
        },
        {
          projectId: project.id,
          primaryContentNodeId: fileB.id,
          importerId: "test-json",
          sourceRootRef: "root",
          sourceNodeRef: "b.json",
          stableSourceRef: `banana-${Date.now()}`,
          stringId: sourceIdByValue.get("Banana")!,
          localOrder: 0,
        },
        {
          projectId: otherProject.id,
          primaryContentNodeId: otherFile.id,
          importerId: "test-json",
          sourceRootRef: "root",
          sourceNodeRef: "other.json",
          stableSourceRef: `kiwi-${Date.now()}`,
          stringId: sourceIdByValue.get("Kiwi")!,
          localOrder: 0,
        },
      ],
    },
  );

  const branch = await executeCommand({ db: testDb.client }, createBranch, {
    projectId: project.id,
    name: "editor-scope-branch",
    createdBy: creatorId,
  });
  const changeset = await executeCommand(
    { db: testDb.client },
    createChangeset,
    {
      projectId: project.id,
      branchId: branch.id,
      createdBy: creatorId,
    },
  );

  const containsTypeId = relationTypeIds["core:contains:1.0.0"];

  if (containsTypeId === undefined) {
    throw new Error("Missing core contains relation type");
  }

  const branchNodeId = randomUUID();
  const branchRelationId = randomUUID();
  const timestamp = new Date().toISOString();

  await executeCommand({ db: testDb.client }, addChangesetEntry, {
    changesetId: changeset.id,
    entityType: "content_node",
    entityId: branchNodeId,
    action: "CREATE",
    after: EditorOverlayContentNodeRowSchema.parse({
      id: branchNodeId,
      projectId: project.id,
      creatorId,
      kind: "FILE",
      displayLabel: "branch.json",
      importerId: "test-json",
      sourceRootRef: "root",
      stableSourceNodeRef: "branch.json",
      sourceUri: null,
      sourcePath: null,
      sourceType: null,
      languageId: "en",
      exportRole: "FILE",
      boundaryType: "FILE",
      fileHandlerId: null,
      fileId: null,
      lifecycleStatus: "ACTIVE",
      provenance: null,
      metadata: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    riskLevel: "LOW",
  });
  await executeCommand({ db: testDb.client }, addChangesetEntry, {
    changesetId: changeset.id,
    entityType: "content_relation",
    entityId: branchRelationId,
    action: "CREATE",
    after: EditorOverlayContentRelationRowSchema.parse({
      id: branchRelationId,
      projectId: project.id,
      relationTypeId: containsTypeId,
      sourceEndpointKind: "NODE",
      sourceNodeId: root.id,
      sourceElementId: null,
      targetEndpointKind: "NODE",
      targetNodeId: branchNodeId,
      targetElementId: null,
      isPrimary: true,
      localOrder: 9,
      confidenceBasisPoints: 10000,
      lifecycleStatus: "ACTIVE",
      weightHint: null,
      provenance: null,
      validationMetadata: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    riskLevel: "LOW",
  });

  const otherBranch = await executeCommand(
    { db: testDb.client },
    createBranch,
    {
      projectId: otherProject.id,
      name: "other-project-branch",
      createdBy: creatorId,
    },
  );

  return {
    project,
    root,
    fileA,
    fileB,
    otherProject,
    otherFile,
    branch,
    otherBranch,
    branchNodeId,
    elementIds: {
      apple: elementIds[0],
      banana: elementIds[1],
      kiwi: elementIds[2],
    },
  };
};

beforeAll(async () => {
  testDb = await setupTestDB();
  await executeCommand({ db: testDb.client }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });
  const user = await executeCommand({ db: testDb.client }, createUser, {
    email: "editor-router@test.local",
    name: "Editor Router Tester",
  });
  creatorId = user.id;
});

afterAll(async () => {
  await testDb.cleanup();
});

beforeEach(() => {
  permissionCheck.mockClear();
  permissionCheck.mockResolvedValue(true);
});

describe("editor router", () => {
  test("resolveScope sanitizes invalid content-node filters and deduplicates valid ones", async () => {
    const fixture = await seedFixture();
    const context = createMockContext(testDb);

    const result = await invokeProcedure<{
      contentNodeIds: string[];
      invalidContentNodeIds: string[];
      contentNodeFilters: unknown[];
      sortMode: "structure" | "reuse-first";
    }>(resolveScope, context, {
      projectId: fixture.project.id,
      languageToId: "zh-Hans",
      contentNodeIds: [
        fixture.fileA.id,
        fixture.otherFile.id,
        fixture.fileA.id,
      ],
      searchQuery: "",
      statusFilter: "all",
      sortMode: "reuse-first",
      page: 1,
      pageSize: 16,
    });

    expect(result.contentNodeIds).toEqual([fixture.fileA.id]);
    expect(result.invalidContentNodeIds).toEqual([fixture.otherFile.id]);
    expect(result.contentNodeFilters).toHaveLength(1);
    expect(result.sortMode).toBe("reuse-first");
  });

  test("listContentNodes returns branch-visible nodes, excludes project root, and includes path metadata", async () => {
    const fixture = await seedFixture();
    const context = createMockContext(testDb);

    const result = await invokeProcedure<
      Array<{
        id: string;
        path: Array<{ id: string; label: string }>;
        kind: string;
      }>
    >(listContentNodes, context, {
      projectId: fixture.project.id,
      branchId: fixture.branch.id,
    });

    expect(result.some((node) => node.kind === "PROJECT_ROOT")).toBe(false);
    const branchNode = result.find((node) => node.id === fixture.branchNodeId);
    expect(branchNode).toBeDefined();
    expect(branchNode?.path.at(-1)?.id).toBe(fixture.branchNodeId);
  });

  test("listContentNodes rejects cross-project branch ids before querying content nodes", async () => {
    const fixture = await seedFixture();
    const context = createMockContext(testDb);
    const listContentNodesSpy = vi.spyOn(domain, "listEditorScopeContentNodes");

    await expect(
      invokeProcedure(listContentNodes, context, {
        projectId: fixture.project.id,
        branchId: fixture.otherBranch.id,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(listContentNodesSpy).not.toHaveBeenCalled();
  });

  test("listElements checks project viewer permission and never yields rows from cross-project filters", async () => {
    const fixture = await seedFixture();
    const context = createMockContext(testDb);

    const result = await invokeProcedure<
      Array<{ id: number; primaryContentNodeId: string; value: string }>
    >(listElements, context, {
      projectId: fixture.project.id,
      languageToId: "zh-Hans",
      contentNodeIds: [fixture.otherFile.id],
      searchQuery: "",
      statusFilter: "all",
      sortMode: "reuse-first",
      page: 0,
      pageSize: 16,
    });

    expect(permissionCheck).toHaveBeenCalledWith(
      expect.objectContaining({ subjectId: creatorId }),
      { type: "project", id: fixture.project.id },
      "viewer",
    );
    expect(
      result.every((row) => row.primaryContentNodeId !== fixture.otherFile.id),
    ).toBe(true);
  });

  test("getElementPageIndex returns null when the element falls outside the sanitized scope", async () => {
    const fixture = await seedFixture();
    const context = createMockContext(testDb);

    const pageIndex = await invokeProcedure<number | null>(
      getElementPageIndex,
      context,
      {
        projectId: fixture.project.id,
        languageToId: "zh-Hans",
        contentNodeIds: [fixture.fileA.id, fixture.otherFile.id],
        searchQuery: "",
        statusFilter: "all",
        page: 0,
        pageSize: 16,
        elementId: fixture.elementIds.banana,
      },
    );

    expect(pageIndex).toBeNull();
  });

  test("listElements rejects a branch from another project before running scope queries", async () => {
    const fixture = await seedFixture();
    const context = createMockContext(testDb);
    const listElementsSpy = vi.spyOn(domain, "listEditorScopeElements");

    await expect(
      invokeProcedure(listElements, context, {
        projectId: fixture.project.id,
        languageToId: "zh-Hans",
        branchId: fixture.otherBranch.id,
        contentNodeIds: [],
        searchQuery: "",
        statusFilter: "all",
        page: 0,
        pageSize: 16,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(listElementsSpy).not.toHaveBeenCalled();
  });
});
