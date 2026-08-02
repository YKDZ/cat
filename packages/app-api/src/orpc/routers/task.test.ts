import { randomUUID } from "node:crypto";

import {
  createProject,
  createUser,
  createWorkflowTaskWithDispatch,
  createRecallDerivationTask,
  ensureCoreRelationTypes,
  executeCommand,
  ensureLanguages,
  grantPermissionTuple,
  MemoryCacheStore,
} from "@cat/domain";
import { initPermissionEngine } from "@cat/permissions";
import { PluginManager } from "@cat/plugin-core";
import {
  BatchAutoTranslationInvocationSchema,
  CanonicalInputVersionSchema,
  RecallDerivationReferenceSchema,
} from "@cat/shared";
import {
  createAuthedTestContext,
  setupTestDB,
  type TestDB,
} from "@cat/test-utils";
import { recallDerivationState } from "@cat/test-utils";
import { call } from "@orpc/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Context } from "#/utils/context.ts";

import { cancel, detail, resume, retry } from "./task.ts";

let db: TestDB | undefined;
let context: Context | undefined;
let projectId = "";
let taskId = "";
let recallTaskId = "";

const serviceReference = (
  serviceType: "VECTOR_STORAGE" | "TEXT_VECTORIZER",
) => ({
  pluginId:
    serviceType === "VECTOR_STORAGE" ? "test.vector" : "test.vectorizer",
  serviceId: "default",
  serviceType,
  scopeType: "GLOBAL" as const,
  scopeId: "" as const,
});

beforeAll(async () => {
  db = await setupTestDB();
  initPermissionEngine({
    db: db.client,
    cache: new MemoryCacheStore(`task-router-${randomUUID()}`),
    auditEnabled: false,
  });
  await executeCommand({ db: db.client }, ensureCoreRelationTypes, {});
  await executeCommand({ db: db.client }, ensureLanguages, {
    languageIds: ["en"],
  });
  const user = await executeCommand({ db: db.client }, createUser, {
    email: `${randomUUID()}@example.com`,
    name: "Task reader",
  });
  const project = await executeCommand({ db: db.client }, createProject, {
    name: "Task router project",
    description: null,
    creatorId: user.id,
  });
  projectId = project.id;
  await executeCommand({ db: db.client }, grantPermissionTuple, {
    subjectType: "user",
    subjectId: user.id,
    relation: "viewer",
    objectType: "project",
    objectId: project.id,
  });
  await executeCommand({ db: db.client }, grantPermissionTuple, {
    subjectType: "user",
    subjectId: user.id,
    relation: "editor",
    objectType: "project",
    objectId: project.id,
  });
  const task = await executeCommand(
    { db: db.client },
    createWorkflowTaskWithDispatch,
    {
      task: {
        kind: "BATCH_AUTO_TRANSLATION",
        payload: {
          invocation: BatchAutoTranslationInvocationSchema.parse({
            projectId: project.id,
            contentNodeIds: [],
            elementIds: [],
            sortMode: "structure",
            languageId: "zh-Hans",
            minMemorySimilarity: 0.72,
            maxMemoryAmount: 3,
            memoryVectorStorage: serviceReference("VECTOR_STORAGE"),
            translationVectorStorage: serviceReference("VECTOR_STORAGE"),
            vectorizer: serviceReference("TEXT_VECTORIZER"),
            translatorId: user.id,
            memoryIds: [],
            glossaryIds: [],
          }),
          cancelable: true,
        },
      },
      scope: { type: "PROJECT", id: project.id },
      actor: { type: "USER", id: user.id },
      resources: [{ type: "PROJECT", id: project.id }],
    },
  );
  taskId = task.task.id;
  await db.client.insert(recallDerivationState).values({
    targetKind: "MEMORY_ITEM",
    targetId: "909",
    languageId: "en",
    canonicalInputVersion: CanonicalInputVersionSchema.parse(
      `sha256:${"9".repeat(64)}`,
    ),
  });
  const recallTask = await executeCommand(
    { db: db.client },
    createRecallDerivationTask,
    {
      references: [
        RecallDerivationReferenceSchema.parse({
          targetKind: "MEMORY_ITEM",
          targetId: "909",
          languageId: "en",
          demandRevision: 1,
        }),
      ],
      scope: { type: "PROJECT", id: project.id },
      actor: { type: "USER", id: user.id },
      resources: [{ type: "PROJECT", id: project.id }],
    },
  );
  recallTaskId = recallTask.id;

  const base = createAuthedTestContext(user, {
    drizzleDB: db,
    pluginManager: new PluginManager("GLOBAL", ""),
  });
  context = {
    ...base,
    auth: {
      subjectType: "user",
      subjectId: user.id,
      systemRoles: [],
      scopes: null,
    },
    requestSignal: new AbortController().signal,
    isSSR: true,
    isWebSocket: false,
  };
}, 30_000);

afterAll(async () => {
  await db?.cleanup();
}, 30_000);

describe("task router", () => {
  it("returns the authorized task detail", async () => {
    if (!context) throw new Error("Test context missing.");
    const result = await call(detail, { projectId, taskId }, { context });

    expect(result.task.id).toBe(taskId);
    expect(result.currentFailure).toBeNull();
  });

  it("rejects an unauthorized resume request before touching task execution", async () => {
    if (!db) throw new Error("Test database missing.");
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `${randomUUID()}@example.com`,
      name: "Unauthorized task editor",
    });
    const base = createAuthedTestContext(user, {
      drizzleDB: db,
      pluginManager: new PluginManager("GLOBAL", ""),
    });
    const unauthorizedContext: Context = {
      ...base,
      auth: {
        subjectType: "user",
        subjectId: user.id,
        systemRoles: [],
        scopes: null,
      },
      requestSignal: new AbortController().signal,
      isSSR: true,
      isWebSocket: false,
    };

    await expect(
      call(
        resume,
        { projectId, taskId, requestId: randomUUID() },
        { context: unauthorizedContext },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not expose retry or resume as Recall derivation actions", async () => {
    if (!context) throw new Error("Test context missing.");
    await expect(
      call(retry, { projectId, taskId: recallTaskId }, { context }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      call(
        resume,
        { projectId, taskId: recallTaskId, requestId: randomUUID() },
        { context },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("cancels a Recall derivation task atomically", async () => {
    if (!context) throw new Error("Test context missing.");
    const canceled = await call(
      cancel,
      { projectId, taskId: recallTaskId, requestId: randomUUID() },
      { context },
    );
    expect(canceled.state.status).toBe("CANCELED");
  });
});
