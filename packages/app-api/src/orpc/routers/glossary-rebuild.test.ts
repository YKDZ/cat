import { randomUUID } from "node:crypto";

import {
  createGlossary,
  createGlossaryTerms,
  createProject,
  createUser,
  ensureLanguages,
  executeCommand,
  executeQuery,
  linkProjectGlossaries,
  listScopedTermRecallDerivationStates,
  listTermConceptIdsByRecallVariants,
  writeValidatedLanguageAnalysisSelection,
} from "@cat/domain";
import {
  createRecallDerivationTaskProjectionObserver,
  startRecallDerivationWorker,
  validateLanguageAnalyzerConfiguration,
} from "@cat/operations";
import { PluginManager } from "@cat/plugin-core";
import { LanguageAnalysisWildcardSelectionKey } from "@cat/shared";
import {
  createAuthedTestContext,
  setupTestDB,
  TestPluginLoader,
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

const mocks = vi.hoisted(() => ({ permissionCheck: vi.fn(async () => true) }));

vi.mock("@cat/permissions", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/permissions")>(
      "@cat/permissions",
    );
  return {
    ...actual,
    getPermissionEngine: () => ({ check: mocks.permissionCheck }),
  };
});

import { rebuildRecall } from "./glossary.ts";
import { detail } from "./task.ts";

let db: TestDB;
let userId: string;
let projectId: string;
let glossaryId: string;
let pluginManager: PluginManager;

const context = (scopes: string[] | null): Context => {
  const base = createAuthedTestContext({ id: userId } as never, {
    drizzleDB: db,
    pluginManager,
  });
  return {
    ...base,
    auth: { subjectType: "user", subjectId: userId, systemRoles: [], scopes },
    isSSR: true,
    isWebSocket: false,
    requestSignal: new AbortController().signal,
  } as Context;
};

const createBoundGlossary = async (withTerms: boolean) => {
  const glossary = await executeCommand({ db: db.client }, createGlossary, {
    creatorId: userId,
    name: `rebuild-${randomUUID()}`,
  });
  await executeCommand({ db: db.client }, linkProjectGlossaries, {
    glossaryIds: [glossary.id],
    projectId,
  });
  if (withTerms) {
    await executeCommand({ db: db.client }, createGlossaryTerms, {
      creatorId: userId,
      glossaryId: glossary.id,
      data: [
        {
          definition: null,
          term: "Open",
          termLanguageId: "en",
          translation: "打开",
          translationLanguageId: "zh-Hans",
        },
      ],
    });
  }
  return glossary.id;
};

beforeAll(async () => {
  db = await setupTestDB();
  pluginManager = PluginManager.get(
    "GLOBAL",
    "",
    new TestPluginLoader({ includeLanguageAnalyzer: true }),
  );
  await pluginManager.getDiscovery().syncDefinitions(db.client);
  await pluginManager.install(db.client, "mock-language-analyzer");
  await db.client.transaction(async (tx) => {
    await pluginManager.restore(tx);
  });
  await executeCommand({ db: db.client }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });
  const analyzer = pluginManager.getServices("LANGUAGE_ANALYZER")[0]!;
  const implementation =
    pluginManager.createServiceImplementationReference(analyzer);
  const validated = await validateLanguageAnalyzerConfiguration(
    implementation,
    {
      pluginManager,
      traceId: "glossary-rebuild-router-selection",
    },
  );
  await executeCommand(
    { db: db.client },
    writeValidatedLanguageAnalysisSelection,
    {
      key: LanguageAnalysisWildcardSelectionKey,
      implementation,
      configurationFingerprint: validated.fingerprint,
      expectedRevision: 0,
    },
  );
  const user = await executeCommand({ db: db.client }, createUser, {
    email: `rebuild-router-${randomUUID()}@example.com`,
    name: "Rebuild router user",
  });
  userId = user.id;
  const project = await executeCommand({ db: db.client }, createProject, {
    creatorId: userId,
    description: null,
    name: "Rebuild router project",
  });
  projectId = project.id;
  glossaryId = await createBoundGlossary(true);
});

beforeEach(() => {
  mocks.permissionCheck.mockReset();
  mocks.permissionCheck.mockResolvedValue(true);
});

afterAll(async () => {
  PluginManager.clear();
  await db?.cleanup();
});

describe("glossary.rebuildRecall route", () => {
  it("starts one multi-reference Task for an authorized canonical rebuild", async () => {
    const result = await call(
      rebuildRecall,
      { glossaryId, projectId },
      { context: context(["glossary:editor", "project:editor"]) },
    );
    expect(result).toMatchObject({ status: "STARTED", total: 2 });
  });

  it("returns NO_WORK for a bound empty glossary", async () => {
    const emptyGlossaryId = await createBoundGlossary(false);
    await expect(
      call(
        rebuildRecall,
        { glossaryId: emptyGlossaryId, projectId },
        { context: context(["glossary:editor", "project:editor"]) },
      ),
    ).resolves.toEqual({ status: "NO_WORK" });
  });

  it("projects an unbound empty glossary as a typed relationship failure", async () => {
    const unbound = await executeCommand({ db: db.client }, createGlossary, {
      creatorId: userId,
      name: `unbound-empty-${randomUUID()}`,
    });

    await expect(
      call(
        rebuildRecall,
        { glossaryId: unbound.id, projectId },
        { context: context(["glossary:editor", "project:editor"]) },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: {
        operationContractErrorIdentifier: "relationship_denied",
        operationFailure: {
          code: "CAT_OPERATION_RELATIONSHIP_DENIED",
          capability: "RECALL_DERIVATION",
          affectedResources: [
            { type: "PROJECT", id: projectId },
            { type: "GLOSSARY", id: unbound.id },
          ],
          redactionBoundary: "PUBLIC",
        },
      },
    });
  });

  it.each([
    ["glossary:editor", ["project:editor"]],
    ["project:editor", ["glossary:editor"]],
  ])(
    "rejects a request missing only %s as a typed scope failure",
    async (_missing, scopes) => {
      await expect(
        call(
          rebuildRecall,
          { glossaryId, projectId },
          { context: context(scopes) },
        ),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        data: {
          operationContractErrorIdentifier: "execution_denied",
          operationFailure: {
            code: "CAT_OPERATION_EXECUTION_DENIED",
            capability: "RECALL_DERIVATION",
            affectedResources: [
              { type: "PROJECT", id: projectId },
              { type: "GLOSSARY", id: glossaryId },
            ],
            authorizationDecision: "api_key_scope_denied",
            redactionBoundary: "PUBLIC",
          },
        },
      });
    },
  );

  it("projects a relationship denial as a typed failure", async () => {
    mocks.permissionCheck.mockResolvedValue(false);
    await expect(
      call(
        rebuildRecall,
        { glossaryId, projectId },
        { context: context(["glossary:editor", "project:editor"]) },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: {
        operationContractErrorIdentifier: "relationship_denied",
        operationFailure: {
          code: "CAT_OPERATION_RELATIONSHIP_DENIED",
          capability: "RECALL_DERIVATION",
          affectedResources: [
            { type: "PROJECT", id: projectId },
            { type: "GLOSSARY", id: glossaryId },
          ],
          redactionBoundary: "PUBLIC",
        },
      },
    });
  });

  it("projects an unbound glossary as a typed relationship failure", async () => {
    const unbound = await executeCommand({ db: db.client }, createGlossary, {
      creatorId: userId,
      name: `unbound-${randomUUID()}`,
    });
    await executeCommand({ db: db.client }, createGlossaryTerms, {
      creatorId: userId,
      glossaryId: unbound.id,
      data: [
        {
          definition: null,
          term: "Close",
          termLanguageId: "en",
          translation: "关闭",
          translationLanguageId: "zh-Hans",
        },
      ],
    });
    await expect(
      call(
        rebuildRecall,
        { glossaryId: unbound.id, projectId },
        { context: context(["glossary:editor", "project:editor"]) },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: {
        operationContractErrorIdentifier: "relationship_denied",
        operationFailure: {
          code: "CAT_OPERATION_RELATIONSHIP_DENIED",
          capability: "RECALL_DERIVATION",
          affectedResources: [
            { type: "PROJECT", id: projectId },
            { type: "GLOSSARY", id: unbound.id },
          ],
          redactionBoundary: "PUBLIC",
        },
      },
    });
  });

  it("rejects branch and reference injection at the transport boundary", async () => {
    await expect(
      call(rebuildRecall, { glossaryId, projectId, branchId: 1 } as never, {
        context: context(["glossary:editor", "project:editor"]),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("projects an authorized rebuild through the production worker to task detail", async () => {
    const rebuildGlossaryId = await createBoundGlossary(true);
    const started = await call(
      rebuildRecall,
      { glossaryId: rebuildGlossaryId, projectId },
      { context: context(["glossary:editor", "project:editor"]) },
    );
    if (started.status !== "STARTED") throw new Error("Expected rebuild Task.");

    const worker = await startRecallDerivationWorker({
      db: db.client,
      pluginManager,
      pollIntervalMs: 1,
      onStateCommitted: createRecallDerivationTaskProjectionObserver({
        db: db.client,
      }),
    });
    try {
      const deadline = Date.now() + 10_000;
      let completed = false;
      while (Date.now() < deadline) {
        const detailResult = await call(
          detail,
          { projectId, taskId: started.taskId },
          { context: context(["glossary:editor", "project:editor"]) },
        );
        if (detailResult.task.state.status !== "COMPLETED") {
          await new Promise<void>((resolve) => setTimeout(resolve, 25));
          continue;
        }
        completed = true;
        expect(detailResult.task.state.progressTotal).toBe(started.total);
        expect(detailResult.task.state.runtime.result).toEqual({
          fresh: started.total,
          failed: 0,
          superseded: 0,
          total: started.total,
        });
        expect(detailResult.task.state.resources).toEqual([
          { type: "PROJECT", id: projectId },
          { type: "GLOSSARY", id: rebuildGlossaryId },
        ]);
        break;
      }
      expect(completed).toBe(true);
    } finally {
      await worker.stop();
    }
    const [publishedState] = await executeQuery(
      { db: db.client },
      listScopedTermRecallDerivationStates,
      {
        glossaryIds: [rebuildGlossaryId],
        sourceLanguageId: "en",
        translationLanguageId: "zh-Hans",
      },
    );
    expect(publishedState).toMatchObject({ status: "FRESH" });
    expect(publishedState?.requiredDerivationVersion).not.toBeNull();
    await expect(
      executeQuery({ db: db.client }, listTermConceptIdsByRecallVariants, {
        glossaryIds: [rebuildGlossaryId],
        normalizedText: "open",
        sourceLanguageId: "en",
        requiredDerivationVersion: publishedState!.requiredDerivationVersion!,
        minSimilarity: 0.8,
        maxAmount: 10,
      }),
    ).resolves.toEqual([Number(publishedState!.targetId)]);

    const unauthorized = await executeCommand({ db: db.client }, createUser, {
      email: `rebuild-detail-denied-${randomUUID()}@example.com`,
      name: "Denied rebuild task reader",
    });
    const previous = mocks.permissionCheck.getMockImplementation();
    mocks.permissionCheck.mockResolvedValue(false);
    try {
      const deniedBase = createAuthedTestContext(unauthorized, {
        drizzleDB: db,
        pluginManager,
      });
      const deniedContext = {
        ...deniedBase,
        auth: {
          subjectType: "user" as const,
          subjectId: unauthorized.id,
          systemRoles: [],
          scopes: null,
        },
        isSSR: true,
        isWebSocket: false,
        requestSignal: new AbortController().signal,
      } as Context;
      await expect(
        call(
          detail,
          { projectId, taskId: started.taskId },
          { context: deniedContext },
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      if (previous) mocks.permissionCheck.mockImplementation(previous);
      else mocks.permissionCheck.mockResolvedValue(true);
    }
  });
});
