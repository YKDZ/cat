import { randomUUID } from "node:crypto";

import {
  createProject,
  createUser,
  executeCommand,
  executeQuery,
  grantPermissionTuple,
  listAllElements,
  listProjectContentNodes,
  MemoryCacheStore,
} from "@cat/domain";
import { initPermissionEngine } from "@cat/permissions";
import { PluginManager } from "@cat/plugin-core";
import { createAuthedTestContext, setupTestDB } from "@cat/test-utils";
import { ORPCError, call } from "@orpc/server";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import type { Context } from "#/utils/context.ts";

const mocks = vi.hoisted(() => ({
  assertProjectLanguageAnalysisPreflight: vi.fn(),
  runGraph: vi.fn(),
}));

vi.mock("#/services/language-analysis-preflight.ts", () => ({
  assertProjectLanguageAnalysisPreflight:
    mocks.assertProjectLanguageAnalysisPreflight,
}));

vi.mock("@cat/workflow/tasks", () => ({
  ingestCollectionGraph: {},
  runGraph: mocks.runGraph,
}));

import { ingest } from "./collection.ts";

let cleanup: (() => Promise<void>) | undefined;
let context: Context;
let projectId = "";

beforeAll(async () => {
  const db = await setupTestDB();
  cleanup = db.cleanup;
  initPermissionEngine({
    db: db.client,
    cache: new MemoryCacheStore(`collection-router-${randomUUID()}`),
    auditEnabled: false,
  });
  const user = await executeCommand({ db: db.client }, createUser, {
    email: `${randomUUID()}@example.com`,
    name: "Collection editor",
  });
  const project = await executeCommand({ db: db.client }, createProject, {
    name: "Collection blocked admission",
    description: null,
    creatorId: user.id,
  });
  projectId = project.id;
  await executeCommand({ db: db.client }, grantPermissionTuple, {
    subjectType: "user",
    subjectId: user.id,
    relation: "editor",
    objectType: "project",
    objectId: project.id,
  });
  context = {
    ...createAuthedTestContext(undefined, {
      drizzleDB: { client: db.client } as Context["drizzleDB"],
    }),
    auth: {
      subjectType: "user",
      subjectId: user.id,
      systemRoles: [],
      scopes: null,
    },
    user,
    pluginManager: new PluginManager("GLOBAL", ""),
    helpers: {
      setCookie: () => undefined,
      delCookie: () => undefined,
      getCookie: (name) => (name === "csrfToken" ? "csrf-token" : null),
      getQueryParam: () => undefined,
      getReqHeader: (name) =>
        name === "x-csrf-token" ? "csrf-token" : undefined,
      setResHeader: () => undefined,
    },
    csrfToken: "csrf-token",
    requestSignal: new AbortController().signal,
    isSSR: false,
    isWebSocket: false,
  } as Context;
});

afterAll(async () => await cleanup?.());

describe("collection.ingest Language Analysis admission", () => {
  test("rejects MISSING_SELECTION without publishing canonical nodes or elements", async () => {
    mocks.assertProjectLanguageAnalysisPreflight.mockRejectedValue(
      new ORPCError("BAD_REQUEST", {
        message: "Language Analysis is blocked: MISSING_SELECTION",
      }),
    );
    const beforeNodes = await executeQuery(
      { db: context.drizzleDB.client },
      listProjectContentNodes,
      { projectId },
    );
    const beforeElements = (
      await executeQuery({ db: context.drizzleDB.client }, listAllElements, {})
    ).filter((element) => element.projectId === projectId);

    await expect(
      call(
        ingest,
        {
          payloadVersion: "content-graph/v1",
          projectId,
          sourceLanguageId: "de",
          importerId: "blocked-test",
          sourceRootRef: "blocked.json",
          relationTypes: [],
          nodes: [
            {
              ref: "source-file:blocked.json",
              kind: "SOURCE_COMPONENT",
              displayLabel: "blocked.json",
              importerId: "blocked-test",
              sourceRootRef: "blocked.json",
              stableSourceNodeRef: "source-file:blocked.json",
              exportRole: "NONE",
              boundaryType: "FILE",
            },
          ],
          elements: [
            {
              ref: "blocked:/title",
              stableSourceRef: "blocked:/title",
              sourceNodeRef: "source-file:blocked.json",
              text: "Blocked",
              languageId: "de",
            },
          ],
          relations: [],
          evidence: [],
        },
        { context },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      executeQuery({ db: context.drizzleDB.client }, listProjectContentNodes, {
        projectId,
      }),
    ).resolves.toEqual(beforeNodes);
    const afterElements = (
      await executeQuery({ db: context.drizzleDB.client }, listAllElements, {})
    ).filter((element) => element.projectId === projectId);
    expect(afterElements).toHaveLength(beforeElements.length);
    expect(mocks.runGraph).not.toHaveBeenCalled();
  });
});
