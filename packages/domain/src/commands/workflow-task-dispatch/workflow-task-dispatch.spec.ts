import { randomUUID } from "node:crypto";

import { BatchAutoTranslationInvocationSchema } from "@cat/shared";
import { describe, expect, it } from "vitest";

import type { DbHandle } from "#/types.ts";

import { createWorkflowTaskWithDispatch } from "./workflow-task-dispatch.cmd.ts";

const createCommand = () => {
  const projectId = randomUUID();
  const actorId = randomUUID();
  const service = (serviceType: "VECTOR_STORAGE" | "TEXT_VECTORIZER") => ({
    pluginId: `test.${serviceType.toLowerCase()}`,
    serviceId: "default",
    serviceType,
    scopeType: "GLOBAL" as const,
    scopeId: "" as const,
  });
  return {
    task: {
      kind: "BATCH_AUTO_TRANSLATION" as const,
      payload: {
        invocation: BatchAutoTranslationInvocationSchema.parse({
          projectId,
          contentNodeIds: [],
          elementIds: [],
          sortMode: "structure",
          languageId: "zh-Hans",
          minMemorySimilarity: 0.72,
          maxMemoryAmount: 3,
          memoryVectorStorage: service("VECTOR_STORAGE"),
          translationVectorStorage: service("VECTOR_STORAGE"),
          vectorizer: service("TEXT_VECTORIZER"),
          translatorId: actorId,
          memoryIds: [],
          glossaryIds: [],
        }),
        cancelable: true as const,
      },
    },
    scope: { type: "PROJECT" as const, id: projectId },
    actor: { type: "USER" as const, id: actorId },
    resources: [{ type: "PROJECT" as const, id: projectId }],
  };
};

describe("createWorkflowTaskWithDispatch", () => {
  it("rejects invalid closed task contracts before opening a database transaction", async () => {
    const command = createCommand();
    const invalidInputs = [
      {
        ...command,
        task: { ...command.task, kind: "UNSUPPORTED_TASK_KIND" },
      },
      { ...command, scope: { type: "PROJECT", id: "not-a-uuid" } },
      { ...command, actor: { type: "SYSTEM", id: command.actor.id } },
      {
        ...command,
        resources: [{ type: "UNSUPPORTED_RESOURCE", id: "unknown" }],
      },
      { ...command, scope: { type: "PROJECT", id: randomUUID() } },
      { ...command, scope: { type: "USER", id: randomUUID() } },
      { ...command, scope: { type: "INSTANCE", id: null } },
      { ...command, resources: [] },
      {
        ...command,
        resources: [
          ...command.resources,
          { type: "PROJECT", id: randomUUID() },
        ],
      },
      {
        ...command,
        resources: [...command.resources, command.resources[0]!],
      },
      {
        ...command,
        resources: [
          ...command.resources,
          { type: "TRANSLATION", id: randomUUID() },
        ],
      },
    ];

    for (const input of invalidInputs) {
      await expect(
        createWorkflowTaskWithDispatch({ db: {} as DbHandle }, input as never),
      ).rejects.toBeInstanceOf(Error);
    }
  });
});
