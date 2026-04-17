import { executeCommand, executeQuery } from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { createAuthedTestContext } from "@cat/test-utils";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod/v4";

import type { Context } from "@/utils/context";

vi.mock("@cat/domain", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/domain")>("@cat/domain");
  const listAgentRunSnapshotsBySession = Symbol(
    "listAgentRunSnapshotsBySession",
  );

  return {
    ...actual,
    executeCommand: vi.fn(),
    executeQuery: vi.fn(),
    listAgentRunSnapshotsBySession,
  };
});

vi.mock("@cat/permissions", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/permissions")>(
      "@cat/permissions",
    );

  return {
    ...actual,
    getPermissionEngine: () => ({
      check: vi.fn().mockResolvedValue(true),
    }),
  };
});

vi.mock("@cat/agent", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/agent")>("@cat/agent");

  class MockLLMGateway {
    static lastProvider: unknown = null;

    constructor(input: { provider: unknown }) {
      MockLLMGateway.lastProvider = input.provider;
    }
  }

  class MockAgentRuntime {
    async *runLoop(): AsyncIterable<never> {
      yield* [];
    }
  }

  return {
    ...actual,
    AgentRuntime: MockAgentRuntime,
    LLMGateway: MockLLMGateway,
    buildAgentDAG: () => ({
      id: "agent-dag",
      version: "1.0.0",
      nodes: {},
      edges: [],
      entry: "precheck",
    }),
  };
});

import {
  createAgentDefinition,
  createAgentRun,
  deleteAgentDefinition,
  findAgentDefinitionByDefinitionIdAndScope,
  getAgentDefinition,
  getAgentDefinitionByInternalId,
  getAgentRunByInternalId,
  getAgentSessionByExternalId,
  listAgentRunSnapshotsBySession,
  listAgentDefinitions,
  listAgentSessions,
  loadAgentRunSnapshot,
  saveAgentRunSnapshot,
  updateAgentDefinition,
} from "@cat/domain";

import {
  disableBuiltin,
  enableBuiltin,
  get as getAgentRoute,
  getSessionState,
  listBuiltinTemplates,
  listSessions,
  sendMessage,
} from "@/orpc/routers/agent";
import { createAgentToolRegistry } from "@/utils/agent-tool-registry";

type PluginServiceEntry = ReturnType<PluginManager["getServices"]>[number];

const asRecord = (value: unknown): Record<string, unknown> | null => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
};

const createContext = (pluginManager: PluginManager): Context => {
  const base = createAuthedTestContext();

  return {
    ...base,
    pluginManager,
    // Minimal structural stubs are enough because executeQuery/executeCommand are mocked in these tests.
    // oxlint-disable-next-line no-unsafe-type-assertion
    drizzleDB: { client: {} } as unknown as Context["drizzleDB"],
    // oxlint-disable-next-line no-unsafe-type-assertion
    redis: {} as unknown as Context["redis"],
    auth: {
      subjectType: "user",
      subjectId: base.user!.id,
      systemRoles: ["admin"],
      scopes: [],
    },
    isSSR: true,
    isWebSocket: false,
  };
};

const createPluginManager = (options?: {
  llmProviders?: PluginServiceEntry[];
  agentToolProviders?: PluginServiceEntry[];
}): PluginManager => {
  const manager = new PluginManager("GLOBAL", "");

  vi.spyOn(manager, "getServices").mockImplementation((type) => {
    if (type === "LLM_PROVIDER") {
      return options?.llmProviders ?? [];
    }

    if (type === "AGENT_TOOL_PROVIDER") {
      return options?.agentToolProviders ?? [];
    }

    return [];
  });

  return manager;
};

describe("agent router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listBuiltinTemplates only returns GLOBAL builtin templates", async () => {
    vi.mocked(executeQuery).mockImplementation(async (_ctx, query, input) => {
      if (query === listAgentDefinitions) {
        const queryInput = asRecord(input);

        if (queryInput?.["scopeType"] === "GLOBAL") {
          return [
            {
              id: 1,
              externalId: "template-row",
              name: "翻译助手",
              description: "全局模板",
              scopeType: "GLOBAL",
              scopeId: "",
              isBuiltin: true,
              definitionId: "translator",
              version: "1.0.0",
              icon: "languages",
              type: "GENERAL",
              llmConfig: null,
              tools: ["finish"],
              promptConfig: null,
              constraints: null,
              securityPolicy: null,
              orchestration: null,
              content: "prompt",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ];
        }

        return [
          {
            id: 1,
            externalId: "template-row",
            name: "翻译助手",
            description: "全局模板",
            scopeType: "GLOBAL",
            scopeId: "",
            isBuiltin: true,
            definitionId: "translator",
            version: "1.0.0",
            icon: "languages",
            type: "GENERAL",
            llmConfig: null,
            tools: ["finish"],
            promptConfig: null,
            constraints: null,
            securityPolicy: null,
            orchestration: null,
            content: "prompt",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 2,
            externalId: "instance-row",
            name: "翻译助手",
            description: "项目实例",
            scopeType: "PROJECT",
            scopeId: "project-1",
            isBuiltin: true,
            definitionId: "translator",
            version: "1.0.0",
            icon: "languages",
            type: "GENERAL",
            llmConfig: null,
            tools: ["finish"],
            promptConfig: null,
            constraints: null,
            securityPolicy: null,
            orchestration: null,
            content: "prompt",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];
      }

      return null;
    });

    const result = await call(listBuiltinTemplates, undefined, {
      context: createContext(createPluginManager()),
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.templateId).toBe("translator");
  });

  it("enableBuiltin creates once and is idempotent on repeat", async () => {
    vi.mocked(executeQuery).mockImplementation(async (_ctx, query, input) => {
      if (query === findAgentDefinitionByDefinitionIdAndScope) {
        const queryInput = asRecord(input);

        if (queryInput?.["scopeType"] === "GLOBAL") {
          return {
            id: 1,
            externalId: "template-row",
            name: "翻译助手",
            description: "全局模板",
            scopeType: "GLOBAL",
            scopeId: "",
            isBuiltin: true,
            definitionId: "translator",
            version: "1.0.0",
            icon: "languages",
            type: "GENERAL",
            llmConfig: { temperature: 0.3, maxTokens: 4096 },
            tools: ["finish"],
            promptConfig: null,
            constraints: null,
            securityPolicy: null,
            orchestration: null,
            content: "prompt",
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }

        if (queryInput?.["scopeId"] === "project-repeat") {
          return {
            id: 2,
            externalId: "existing-instance",
            name: "翻译助手",
            description: "项目实例",
            scopeType: "PROJECT",
            scopeId: "project-repeat",
            isBuiltin: true,
            definitionId: "translator",
            version: "1.0.0",
            icon: "languages",
            type: "GENERAL",
            llmConfig: { providerId: 9 },
            tools: ["finish"],
            promptConfig: null,
            constraints: null,
            securityPolicy: null,
            orchestration: null,
            content: "prompt",
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }

        return null;
      }

      return null;
    });

    vi.mocked(executeCommand).mockImplementation(async (_ctx, command) => {
      if (command === createAgentDefinition) {
        return { id: "created-instance" };
      }

      return undefined;
    });

    const context = createContext(createPluginManager());

    const first = await call(
      enableBuiltin,
      {
        templateId: "translator",
        scopeType: "PROJECT",
        scopeId: "project-1",
      },
      { context },
    );

    const second = await call(
      enableBuiltin,
      {
        templateId: "translator",
        scopeType: "PROJECT",
        scopeId: "project-repeat",
      },
      { context },
    );

    expect(first.id).toBe("created-instance");
    expect(second.id).toBe("existing-instance");
    expect(vi.mocked(executeCommand)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(executeCommand)).toHaveBeenCalledWith(
      expect.anything(),
      createAgentDefinition,
      expect.objectContaining({
        llmConfig: { temperature: 0.3, maxTokens: 4096 },
      }),
    );
  });

  it("enableBuiltin can attach an explicit fallback provider", async () => {
    const llmProvider = {
      pluginId: "plugin-llm-explicit",
      dbId: 7,
      id: "provider-7",
      service: {
        getId: () => "provider-7",
        getType: () => "LLM_PROVIDER" as const,
        getModelName: () => "Provider 7",
        chat: async function* () {
          yield* [];
        },
      },
      type: "LLM_PROVIDER" as const,
    };

    vi.mocked(executeQuery).mockImplementation(async (_ctx, query, input) => {
      if (query === findAgentDefinitionByDefinitionIdAndScope) {
        const queryInput = asRecord(input);

        if (queryInput?.["scopeType"] === "GLOBAL") {
          return {
            id: 1,
            externalId: "template-row",
            name: "翻译助手",
            description: "全局模板",
            scopeType: "GLOBAL",
            scopeId: "",
            isBuiltin: true,
            definitionId: "translator",
            version: "1.0.0",
            icon: "languages",
            type: "GENERAL",
            llmConfig: { temperature: 0.3 },
            tools: ["finish"],
            promptConfig: null,
            constraints: null,
            securityPolicy: null,
            orchestration: null,
            content: "prompt",
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }

        return null;
      }

      return null;
    });

    vi.mocked(executeCommand).mockImplementation(async (_ctx, command) => {
      if (command === createAgentDefinition) {
        return { id: "created-with-provider" };
      }

      return undefined;
    });

    await call(
      enableBuiltin,
      {
        templateId: "translator",
        providerId: 7,
        scopeType: "PROJECT",
        scopeId: "project-explicit",
      },
      {
        context: createContext(
          createPluginManager({ llmProviders: [llmProvider] }),
        ),
      },
    );

    expect(vi.mocked(executeCommand)).toHaveBeenCalledWith(
      expect.anything(),
      createAgentDefinition,
      expect.objectContaining({
        llmConfig: { providerId: 7, temperature: 0.3 },
      }),
    );
  });

  it("disableBuiltin deletes only non-GLOBAL builtin instances", async () => {
    vi.mocked(executeQuery).mockImplementation(async (_ctx, query, input) => {
      if (query === getAgentDefinition) {
        const queryInput = asRecord(input);

        if (queryInput?.["id"] === "11111111-1111-4111-8111-111111111111") {
          return {
            id: 2,
            externalId: "11111111-1111-4111-8111-111111111111",
            name: "翻译助手",
            description: "项目实例",
            scopeType: "PROJECT",
            scopeId: "project-1",
            isBuiltin: true,
            definitionId: "translator",
            version: "1.0.0",
            icon: "languages",
            type: "GENERAL",
            llmConfig: { providerId: 7 },
            tools: ["finish"],
            promptConfig: null,
            constraints: null,
            securityPolicy: null,
            orchestration: null,
            content: "prompt",
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }

        return {
          id: 1,
          externalId: "22222222-2222-4222-8222-222222222222",
          name: "翻译助手",
          description: "全局模板",
          scopeType: "GLOBAL",
          scopeId: "",
          isBuiltin: true,
          definitionId: "translator",
          version: "1.0.0",
          icon: "languages",
          type: "GENERAL",
          llmConfig: { providerId: 1 },
          tools: ["finish"],
          promptConfig: null,
          constraints: null,
          securityPolicy: null,
          orchestration: null,
          content: "prompt",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }

      return null;
    });

    const context = createContext(createPluginManager());

    await call(
      disableBuiltin,
      { id: "11111111-1111-4111-8111-111111111111" },
      { context },
    );

    await expect(
      call(
        disableBuiltin,
        { id: "22222222-2222-4222-8222-222222222222" },
        { context },
      ),
    ).rejects.toThrow();
    expect(vi.mocked(executeCommand)).toHaveBeenCalledWith(
      expect.anything(),
      deleteAgentDefinition,
      { agentDefinitionId: 2 },
    );
  });

  it("sendMessage prefers providerId from session metadata", async () => {
    const llmProviderFromSession = {
      pluginId: "plugin-llm-session",
      dbId: 7,
      id: "provider-7",
      service: {
        getId: () => "provider-7",
        getType: () => "LLM_PROVIDER" as const,
        getModelName: () => "Provider 7",
        chat: async function* () {
          yield* [];
        },
      },
      type: "LLM_PROVIDER" as const,
    };
    const llmProviderFromDefinition = {
      pluginId: "plugin-llm-definition",
      dbId: 9,
      id: "provider-9",
      service: {
        getId: () => "provider-9",
        getType: () => "LLM_PROVIDER" as const,
        getModelName: () => "Provider 9",
        chat: async function* () {
          yield* [];
        },
      },
      type: "LLM_PROVIDER" as const,
    };

    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === getAgentSessionByExternalId) {
        return {
          id: 1,
          externalId: "session-1",
          agentDefinitionId: 101,
          agentDefinitionExternalId: "agent-def-1",
          projectId: "00000000-0000-0000-0000-000000000111",
          currentRunId: null,
          status: "ACTIVE",
          userId: "00000000-0000-0000-0000-000000000001",
          metadata: { providerId: 7 },
        };
      }

      if (query === getAgentDefinitionByInternalId) {
        return {
          id: 101,
          externalId: "agent-def-1",
          name: "翻译助手",
          description: "desc",
          scopeType: "PROJECT",
          scopeId: "project-1",
          isBuiltin: true,
          definitionId: "translator",
          version: "1.0.0",
          icon: "languages",
          type: "GENERAL",
          llmConfig: { providerId: 9 },
          tools: ["finish"],
          promptConfig: null,
          constraints: null,
          securityPolicy: null,
          orchestration: null,
          content: "prompt",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }

      if (query === listAgentRunSnapshotsBySession) {
        return [];
      }

      if (query === loadAgentRunSnapshot) {
        return { messages: [] };
      }

      return null;
    });

    vi.mocked(executeCommand).mockImplementation(async (_ctx, command) => {
      if (command === createAgentRun) {
        return { runId: "run-1", runDbId: 1 };
      }

      if (command === saveAgentRunSnapshot) {
        return undefined;
      }

      return undefined;
    });

    const context = createContext(
      createPluginManager({
        llmProviders: [llmProviderFromSession, llmProviderFromDefinition],
      }),
    );

    const stream = await call(
      sendMessage,
      { sessionId: "11111111-1111-4111-8111-111111111111", message: "hello" },
      { context },
    );

    for await (const _event of stream) {
      // exhaust the stream
    }

    const agentModule = await import("@cat/agent");

    expect(Reflect.get(agentModule.LLMGateway, "lastProvider")).toBe(
      llmProviderFromSession.service,
    );
  });

  it("getSessionState merges per-run snapshots into a full message history", async () => {
    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === getAgentSessionByExternalId) {
        return {
          id: 1,
          externalId: "session-1",
          agentDefinitionId: 101,
          agentDefinitionExternalId: "agent-def-1",
          projectId: "00000000-0000-0000-0000-000000000111",
          currentRunId: 11,
          status: "ACTIVE",
          userId: "00000000-0000-0000-0000-000000000001",
          metadata: { projectId: "00000000-0000-0000-0000-000000000111" },
        };
      }

      if (query === getAgentRunByInternalId) {
        return {
          id: 11,
          externalId: "run-current",
          status: "running",
          blackboardSnapshot: {
            messages: [{ role: "assistant", content: "partial" }],
          },
        };
      }

      if (query === listAgentRunSnapshotsBySession) {
        return [
          {
            externalId: "run-1",
            status: "completed",
            startedAt: new Date("2026-04-11T00:00:00.000Z"),
            completedAt: new Date("2026-04-11T00:00:10.000Z"),
            blackboardSnapshot: {
              messages: [
                {
                  role: "user",
                  content: "hello",
                  createdAt: "2026-04-11T00:00:00.000Z",
                },
              ],
            },
          },
          {
            externalId: "run-2",
            status: "completed",
            startedAt: new Date("2026-04-11T00:01:00.000Z"),
            completedAt: new Date("2026-04-11T00:01:10.000Z"),
            blackboardSnapshot: {
              messages: [
                {
                  role: "user",
                  content: "hello",
                  createdAt: "2026-04-11T00:00:00.000Z",
                },
                {
                  role: "assistant",
                  content: "hi",
                  createdAt: "2026-04-11T00:00:05.000Z",
                },
              ],
            },
          },
          {
            externalId: "run-3",
            status: "running",
            startedAt: new Date("2026-04-11T00:02:00.000Z"),
            completedAt: null,
            blackboardSnapshot: {
              current_turn: 1,
              messages: [
                {
                  role: "assistant",
                  content: "hi",
                  createdAt: "2026-04-11T00:00:05.000Z",
                },
                {
                  role: "user",
                  content: "follow",
                  createdAt: "2026-04-11T00:02:00.000Z",
                },
                {
                  role: "assistant",
                  content: "done",
                  createdAt: "2026-04-11T00:02:05.000Z",
                },
              ],
            },
          },
        ];
      }

      return null;
    });

    const result = await call(
      getSessionState,
      { sessionId: "11111111-1111-4111-8111-111111111111" },
      { context: createContext(createPluginManager()) },
    );

    expect(result.runId).toBe("run-current");
    expect(result.runStatus).toBe("running");
    expect(asRecord(result.blackboardSnapshot)?.["current_turn"]).toBe(1);
    expect(asRecord(result.blackboardSnapshot)?.["messages"]).toEqual([
      {
        role: "user",
        content: "hello",
        createdAt: "2026-04-11T00:00:00.000Z",
      },
      {
        role: "assistant",
        content: "hi",
        createdAt: "2026-04-11T00:00:05.000Z",
      },
      {
        role: "user",
        content: "follow",
        createdAt: "2026-04-11T00:02:00.000Z",
      },
      {
        role: "assistant",
        content: "done",
        createdAt: "2026-04-11T00:02:05.000Z",
      },
    ]);
  });

  it("sendMessage seeds the new run snapshot with previous history", async () => {
    const llmProvider = {
      pluginId: "plugin-llm-session",
      dbId: 7,
      id: "provider-7",
      service: {
        getId: () => "provider-7",
        getType: () => "LLM_PROVIDER" as const,
        getModelName: () => "Provider 7",
        chat: async function* () {
          yield* [];
        },
      },
      type: "LLM_PROVIDER" as const,
    };

    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === getAgentSessionByExternalId) {
        return {
          id: 1,
          externalId: "session-1",
          agentDefinitionId: 101,
          agentDefinitionExternalId: "agent-def-1",
          projectId: "00000000-0000-0000-0000-000000000111",
          currentRunId: null,
          status: "ACTIVE",
          userId: "00000000-0000-0000-0000-000000000001",
          metadata: { providerId: 7 },
        };
      }

      if (query === getAgentDefinitionByInternalId) {
        return {
          id: 101,
          externalId: "agent-def-1",
          name: "翻译助手",
          description: "desc",
          scopeType: "PROJECT",
          scopeId: "project-1",
          isBuiltin: true,
          definitionId: "translator",
          version: "1.0.0",
          icon: "languages",
          type: "GENERAL",
          llmConfig: { providerId: 7 },
          tools: ["finish"],
          promptConfig: null,
          constraints: null,
          securityPolicy: null,
          orchestration: null,
          content: "prompt",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }

      if (query === listAgentRunSnapshotsBySession) {
        return [
          {
            externalId: "run-1",
            status: "completed",
            startedAt: new Date("2026-04-11T00:00:00.000Z"),
            completedAt: new Date("2026-04-11T00:00:10.000Z"),
            blackboardSnapshot: {
              current_card_id: "card-1",
              messages: [
                {
                  role: "user",
                  content: "hello",
                  createdAt: "2026-04-11T00:00:00.000Z",
                },
              ],
            },
          },
          {
            externalId: "run-2",
            status: "completed",
            startedAt: new Date("2026-04-11T00:01:00.000Z"),
            completedAt: new Date("2026-04-11T00:01:10.000Z"),
            blackboardSnapshot: {
              current_card_id: "card-1",
              messages: [
                {
                  role: "user",
                  content: "hello",
                  createdAt: "2026-04-11T00:00:00.000Z",
                },
                {
                  role: "assistant",
                  content: "world",
                  createdAt: "2026-04-11T00:00:05.000Z",
                },
              ],
            },
          },
        ];
      }

      if (query === loadAgentRunSnapshot) {
        return {
          messages: [
            { role: "user", content: "hello" },
            { role: "assistant", content: "world" },
            { role: "user", content: "next turn" },
          ],
        };
      }

      return null;
    });

    vi.mocked(executeCommand).mockImplementation(async (_ctx, command) => {
      if (command === createAgentRun) {
        return { runId: "run-1", runDbId: 1 };
      }

      if (command === saveAgentRunSnapshot) {
        return undefined;
      }

      return undefined;
    });

    const stream = await call(
      sendMessage,
      {
        sessionId: "11111111-1111-4111-8111-111111111111",
        message: "next turn",
      },
      {
        context: createContext(
          createPluginManager({ llmProviders: [llmProvider] }),
        ),
      },
    );

    for await (const _event of stream) {
      // exhaust the stream
    }

    expect(vi.mocked(executeCommand)).toHaveBeenCalledWith(
      expect.anything(),
      saveAgentRunSnapshot,
      expect.objectContaining({
        externalId: "run-1",
        snapshot: expect.objectContaining({
          current_card_id: "card-1",
          current_turn: 0,
          started_at: expect.any(String),
          messages: [
            {
              role: "user",
              content: "hello",
              createdAt: "2026-04-11T00:00:00.000Z",
            },
            {
              role: "assistant",
              content: "world",
              createdAt: "2026-04-11T00:00:05.000Z",
            },
            {
              role: "user",
              content: "next turn",
              createdAt: expect.any(String),
            },
          ],
        }),
      }),
    );
  });

  it("listSessions forwards projectId to listAgentSessions", async () => {
    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === listAgentSessions) {
        return [];
      }

      return null;
    });

    const input = {
      projectId: "11111111-1111-4111-8111-111111111111",
      limit: 20,
      offset: 0,
    } satisfies {
      projectId: string;
      limit: number;
      offset: number;
    };

    await call(
      // oxlint-disable-next-line no-unsafe-type-assertion
      listSessions as never,
      // oxlint-disable-next-line no-unsafe-type-assertion
      input as never,
      { context: createContext(createPluginManager()) },
    );

    expect(vi.mocked(executeQuery)).toHaveBeenCalledWith(
      expect.anything(),
      listAgentSessions,
      expect.objectContaining({
        projectId: "11111111-1111-4111-8111-111111111111",
      }),
    );
  });

  it("get nulls a dangling fallback provider while preserving other llm config", async () => {
    const activeProvider = {
      pluginId: "plugin-llm-active",
      dbId: 7,
      id: "provider-7",
      service: {
        getId: () => "provider-7",
        getType: () => "LLM_PROVIDER" as const,
        getModelName: () => "Provider 7",
        chat: async function* () {
          yield* [];
        },
      },
      type: "LLM_PROVIDER" as const,
    };

    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === getAgentDefinition) {
        return {
          id: 3,
          externalId: "33333333-3333-4333-8333-333333333333",
          name: "翻译助手",
          description: "项目实例",
          scopeType: "PROJECT",
          scopeId: "project-1",
          isBuiltin: true,
          definitionId: "translator",
          version: "1.0.0",
          icon: "languages",
          type: "GENERAL",
          llmConfig: { providerId: 99, temperature: 0.4, maxTokens: 2048 },
          tools: ["finish"],
          promptConfig: null,
          constraints: null,
          securityPolicy: null,
          orchestration: null,
          content: "prompt",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }

      return null;
    });

    const result = await call(
      getAgentRoute,
      { id: "33333333-3333-4333-8333-333333333333" },
      {
        context: createContext(
          createPluginManager({ llmProviders: [activeProvider] }),
        ),
      },
    );

    expect(result.llmConfig).toEqual({
      providerId: null,
      temperature: 0.4,
      maxTokens: 2048,
    });
    expect(vi.mocked(executeCommand)).toHaveBeenCalledWith(
      expect.anything(),
      updateAgentDefinition,
      {
        id: "33333333-3333-4333-8333-333333333333",
        llmConfig: {
          providerId: null,
          temperature: 0.4,
          maxTokens: 2048,
        },
      },
    );
  });

  it("createAgentToolRegistry registers builtin and plugin tools", () => {
    const manager = createPluginManager({
      agentToolProviders: [
        {
          pluginId: "plugin-agent-tools",
          dbId: 1,
          id: "tool-provider",
          type: "AGENT_TOOL_PROVIDER" as const,
          service: {
            getId: () => "tool-provider",
            getType: () => "AGENT_TOOL_PROVIDER" as const,
            getTools: () => [
              {
                name: "plugin_tool",
                description: "plugin tool",
                parameters: z.object({}),
                execute: async () => ({ ok: true }),
              },
            ],
          },
        },
      ],
    });

    const registry = createAgentToolRegistry(manager);
    const toolNames = registry
      .resolve([
        "finish",
        "list_elements",
        "get_neighbors",
        "get_translations",
        "submit_translation",
        "qa_check",
        "plugin_tool",
      ])
      .map((tool) => tool.name);

    expect(toolNames).toEqual([
      "finish",
      "list_elements",
      "get_neighbors",
      "get_translations",
      "submit_translation",
      "qa_check",
      "plugin_tool",
    ]);
  });
});
