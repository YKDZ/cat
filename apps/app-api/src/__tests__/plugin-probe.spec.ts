import { executeCommand, executeQuery } from "@cat/domain";
import {
  PluginManager,
  type IPluginService,
  type PluginDiscoveryService,
  type PluginLoader,
} from "@cat/plugin-core";
import { createAuthedTestContext } from "@cat/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "@/utils/context";

vi.mock("@cat/domain", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/domain")>("@cat/domain");
  return { ...actual, executeCommand: vi.fn(), executeQuery: vi.fn() };
});

import {
  getPlugin,
  getPluginConfig,
  getPluginConfigInstance,
  getPluginInstallation,
  listPluginServicesForInstallation,
} from "@cat/domain";

import { probePluginConfig } from "@/services/plugin-probe";
import { errorMessage, redactJson } from "@/services/plugin-redaction";

const PLUGIN_ID = "probe-plugin";
const UPDATED_AT = new Date("2026-05-16T00:00:00.000Z");

const createContext = (
  manager: PluginManager,
  requestSignal?: AbortSignal,
): Context => {
  const base = createAuthedTestContext();
  return {
    ...base,
    pluginManager: manager,
    auth: {
      subjectType: "user",
      subjectId: base.user!.id,
      systemRoles: ["admin"],
      scopes: [],
    },
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    drizzleDB: {
      client: { transaction: vi.fn() },
    } as unknown as Context["drizzleDB"],
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    redis: {} as unknown as Context["redis"],
    isSSR: true,
    isWebSocket: false,
    requestSignal,
  };
};

const makeLoader = (
  pluginObj: { services?: () => Promise<IPluginService[]> | IPluginService[] },
  manifestServices: Array<{
    id?: string;
    type: ReturnType<IPluginService["getType"]>;
  }> = [],
): PluginLoader => {
  return {
    getManifest: vi.fn().mockResolvedValue({
      id: PLUGIN_ID,
      version: "0.0.1",
      entry: "index.js",
      services: manifestServices,
    }),
    getData: vi.fn().mockResolvedValue({
      id: PLUGIN_ID,
      name: PLUGIN_ID,
      version: "0.0.1",
      overview: "probe plugin",
      entry: "index.js",
    }),
    getInstance: vi.fn().mockResolvedValue(pluginObj),
    listAvailablePlugins: vi.fn().mockResolvedValue([]),
  };
};

const makeManager = (
  servicesFactory:
    | (() => Promise<IPluginService[]> | IPluginService[])
    | undefined,
  manifestServices: Array<{
    id?: string;
    type: ReturnType<IPluginService["getType"]>;
  }>,
): PluginManager => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const discovery = {
    registerDefinition: vi.fn().mockResolvedValue(undefined),
  } as unknown as PluginDiscoveryService;
  return new PluginManager(
    "GLOBAL",
    "",
    makeLoader({ services: servicesFactory }, manifestServices),
    discovery,
  );
};

const mockDetailQueries = (options?: {
  config?: {
    id: number;
    pluginId: string;
    schema: Record<string, unknown>;
  } | null;
  installation?: { id: number } | null;
  configInstance?: {
    id: number;
    value: Record<string, unknown>;
    creatorId: string | null;
    configId: number;
    pluginInstallationId: number;
    createdAt: Date;
    updatedAt: Date;
  } | null;
}) => {
  vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
    if (query === getPlugin) {
      return {
        id: PLUGIN_ID,
        name: PLUGIN_ID,
        overview: "probe plugin",
        isExternal: false,
        entry: "index.js",
        iconUrl: null,
        version: "0.0.1",
        createdAt: UPDATED_AT,
        updatedAt: UPDATED_AT,
      };
    }
    if (query === getPluginConfig) return options?.config ?? null;
    if (query === getPluginInstallation) return options?.installation ?? null;
    if (query === getPluginConfigInstance)
      return options?.configInstance ?? null;
    if (query === listPluginServicesForInstallation) return [];
    return null;
  });
};

const mockActivateQueries = () => {
  vi.mocked(executeQuery).mockReset();
  vi.mocked(executeQuery)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce({ id: 1 })
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([
      { dbId: 1, pluginId: PLUGIN_ID, serviceId: "runtime-llm" },
    ]);
  vi.mocked(executeCommand).mockResolvedValue(undefined);
};

describe("plugin redaction helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    PluginManager.clear();
  });

  it("redacts JSON secret fields recursively", () => {
    expect(redactJson({ apiKey: "sk-test" })).toEqual({
      apiKey: "[REDACTED]",
    });
    expect(redactJson({ nested: { secretAccessKey: "minio-secret" } })).toEqual(
      { nested: { secretAccessKey: "[REDACTED]" } },
    );
  });

  it("redacts secret-bearing error messages", () => {
    expect(
      errorMessage(new Error("authorization=Bearer sk-test")),
    ).not.toContain("sk-test");
    expect(
      errorMessage(new Error("Authorization: Bearer sk-test")),
    ).not.toContain("sk-test");
    expect(errorMessage(new Error("Bearer sk-test"))).toBe("Bearer [REDACTED]");
  });
});

describe("plugin probe service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    PluginManager.clear();
  });

  it("candidate LLM probe succeeds without mutating runtime state", async () => {
    const llmService = {
      getId: () => "candidate-llm",
      getType: () => "LLM_PROVIDER" as const,
      getModelName: () => "demo-llm",
      chat: async function* () {
        yield { type: "text_delta" as const, textDelta: "OK" };
        yield {
          type: "usage" as const,
          usage: { promptTokens: 1, completionTokens: 1 },
        };
        yield { type: "finish" as const, finishReason: "stop" as const };
      },
    };
    const manager = makeManager(
      async () => [llmService],
      [{ id: "candidate-llm", type: "LLM_PROVIDER" }],
    );
    vi.spyOn(PluginManager, "get").mockReturnValue(manager);
    mockDetailQueries();

    const result = await probePluginConfig(createContext(manager), {
      pluginId: PLUGIN_ID,
      scopeType: "GLOBAL",
      scopeId: "",
      target: "CANDIDATE",
    });

    expect(result.overallStatus).toBe("SUCCESS");
    expect(result.results[0]?.status).toBe("SUCCESS");
    expect(result.results[0]?.summary).toMatchObject({ model: "demo-llm" });
    expect(manager.getRuntimeSnapshot(PLUGIN_ID).services).toHaveLength(0);
  });

  it("runtime probe uses active service instances after activation", async () => {
    const llmService = {
      getId: () => "runtime-llm",
      getType: () => "LLM_PROVIDER" as const,
      getModelName: () => "runtime-model",
      chat: async function* () {
        yield { type: "text_delta" as const, textDelta: "OK" };
        yield { type: "finish" as const, finishReason: "stop" as const };
      },
    };
    const manager = makeManager(
      async () => [llmService],
      [{ id: "runtime-llm", type: "LLM_PROVIDER" }],
    );
    vi.spyOn(PluginManager, "get").mockReturnValue(manager);
    mockActivateQueries();

    await manager.activate(createContext(manager).drizzleDB.client, PLUGIN_ID);

    const result = await probePluginConfig(createContext(manager), {
      pluginId: PLUGIN_ID,
      scopeType: "GLOBAL",
      scopeId: "",
      target: "RUNTIME",
    });

    expect(manager.getRuntimeSnapshot(PLUGIN_ID).services).toHaveLength(1);
    expect(result.overallStatus).toBe("SUCCESS");
    expect(result.results[0]?.summary).toMatchObject({
      model: "runtime-model",
    });
  });

  it("reads vector dimensions and metadata from the first vectorizer result", async () => {
    const vectorizer = {
      getId: () => "vectorizer",
      getType: () => "TEXT_VECTORIZER" as const,
      canVectorize: () => true,
      vectorize: vi
        .fn()
        .mockResolvedValue([
          [{ meta: { provider: "demo" }, vector: [1, 2, 3] }],
        ]),
    };
    const manager = makeManager(
      async () => [vectorizer],
      [{ id: "vectorizer", type: "TEXT_VECTORIZER" }],
    );
    vi.spyOn(PluginManager, "get").mockReturnValue(manager);
    mockDetailQueries();

    const result = await probePluginConfig(createContext(manager), {
      pluginId: PLUGIN_ID,
      scopeType: "GLOBAL",
      scopeId: "",
      target: "CANDIDATE",
    });

    expect(result.results[0]?.status).toBe("SUCCESS");
    expect(result.results[0]?.summary).toMatchObject({
      dimension: 3,
      meta: { provider: "demo" },
    });
  });

  it("returns unsupported for EMAIL services without calling sendEmail", async () => {
    const sendEmail = vi.fn();
    const emailProvider = {
      getId: () => "email",
      getType: () => "EMAIL_PROVIDER" as const,
      sendEmail,
    };
    const manager = makeManager(
      async () => [emailProvider],
      [{ id: "email", type: "EMAIL_PROVIDER" }],
    );
    vi.spyOn(PluginManager, "get").mockReturnValue(manager);
    mockDetailQueries();

    const result = await probePluginConfig(createContext(manager), {
      pluginId: PLUGIN_ID,
      scopeType: "GLOBAL",
      scopeId: "",
      target: "CANDIDATE",
    });

    expect(result.results[0]?.status).toBe("UNSUPPORTED");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("redacts secrets from service failures", async () => {
    const storage = {
      getId: () => "storage",
      getType: () => "STORAGE_PROVIDER" as const,
      ping: vi
        .fn()
        .mockRejectedValue(new Error("authorization=Bearer sk-secret")),
    };
    const manager = makeManager(
      async () => [storage],
      [{ id: "storage", type: "STORAGE_PROVIDER" }],
    );
    vi.spyOn(PluginManager, "get").mockReturnValue(manager);
    mockDetailQueries();

    const result = await probePluginConfig(createContext(manager), {
      pluginId: PLUGIN_ID,
      scopeType: "GLOBAL",
      scopeId: "",
      target: "CANDIDATE",
    });

    expect(result.results[0]?.status).toBe("FAILED");
    expect(result.results[0]?.error?.message).not.toContain("sk-secret");
  });

  it("returns CANCELLED when the request is aborted in flight", async () => {
    const controller = new AbortController();
    const vectorize = vi.fn(async ({ signal }: { signal?: AbortSignal }) => {
      return await new Promise<never>((_, reject) => {
        signal?.addEventListener(
          "abort",
          () => {
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      });
    });
    const vectorizer = {
      getId: () => "abortable-vectorizer",
      getType: () => "TEXT_VECTORIZER" as const,
      canVectorize: () => true,
      vectorize,
    };
    const manager = makeManager(
      async () => [vectorizer],
      [{ id: "abortable-vectorizer", type: "TEXT_VECTORIZER" }],
    );
    vi.spyOn(PluginManager, "get").mockReturnValue(manager);
    mockDetailQueries();

    const resultPromise = probePluginConfig(
      createContext(manager, controller.signal),
      {
        pluginId: PLUGIN_ID,
        scopeType: "GLOBAL",
        scopeId: "",
        target: "CANDIDATE",
      },
    );

    controller.abort();
    const result = await resultPromise;

    expect(result.results[0]?.status).toBe("CANCELLED");
  });

  it("returns CANCELLED for pre-aborted signals without invoking the service", async () => {
    const controller = new AbortController();
    controller.abort();
    const vectorize = vi.fn();
    const vectorizer = {
      getId: () => "pre-aborted-vectorizer",
      getType: () => "TEXT_VECTORIZER" as const,
      canVectorize: () => true,
      vectorize,
    };
    const manager = makeManager(
      async () => [vectorizer],
      [{ id: "pre-aborted-vectorizer", type: "TEXT_VECTORIZER" }],
    );
    vi.spyOn(PluginManager, "get").mockReturnValue(manager);
    mockDetailQueries();

    const result = await probePluginConfig(
      createContext(manager, controller.signal),
      {
        pluginId: PLUGIN_ID,
        scopeType: "GLOBAL",
        scopeId: "",
        target: "CANDIDATE",
      },
    );

    expect(result.results[0]?.status).toBe("CANCELLED");
    expect(vectorize).not.toHaveBeenCalled();
  });

  it("returns TIMEOUT when a service never resolves", async () => {
    const storage = {
      getId: () => "slow-storage",
      getType: () => "STORAGE_PROVIDER" as const,
      ping: vi
        .fn()
        .mockImplementation(async () => await new Promise(() => undefined)),
    };
    const manager = makeManager(
      async () => [storage],
      [{ id: "slow-storage", type: "STORAGE_PROVIDER" }],
    );
    vi.spyOn(PluginManager, "get").mockReturnValue(manager);
    mockDetailQueries();

    const result = await probePluginConfig(createContext(manager), {
      pluginId: PLUGIN_ID,
      scopeType: "GLOBAL",
      scopeId: "",
      target: "CANDIDATE",
      timeoutMs: 1,
    });

    expect(result.results[0]?.status).toBe("FAILED");
    expect(result.results[0]?.error?.category).toBe("TIMEOUT");
  });

  it("returns structured factory failures without leaking secrets", async () => {
    const manager = makeManager(async () => {
      throw new Error("apiKey=sk-secret");
    }, [{ id: "factory-llm", type: "LLM_PROVIDER" }]);
    vi.spyOn(PluginManager, "get").mockReturnValue(manager);
    mockDetailQueries();

    const result = await probePluginConfig(createContext(manager), {
      pluginId: PLUGIN_ID,
      scopeType: "GLOBAL",
      scopeId: "",
      target: "CANDIDATE",
    });

    expect(result.results[0]?.status).toBe("FAILED");
    expect(result.results[0]?.error?.message).not.toContain("sk-secret");
  });

  it("validates candidate config before creating transient services", async () => {
    const llmService = {
      getId: () => "schema-llm",
      getType: () => "LLM_PROVIDER" as const,
      getModelName: () => "schema-llm",
      chat: async function* () {
        yield { type: "finish" as const, finishReason: "stop" as const };
      },
    };
    const manager = makeManager(
      async () => [llmService],
      [{ id: "schema-llm", type: "LLM_PROVIDER" }],
    );
    const createTransientServicesSpy = vi.spyOn(
      manager,
      "createTransientServices",
    );
    vi.spyOn(PluginManager, "get").mockReturnValue(manager);
    mockDetailQueries({
      config: {
        id: 1,
        pluginId: PLUGIN_ID,
        schema: {
          type: "object",
          properties: { endpoint: { type: "string" } },
          required: ["endpoint"],
        },
      },
      installation: { id: 1 },
      configInstance: null,
    });

    await expect(
      probePluginConfig(createContext(manager), {
        pluginId: PLUGIN_ID,
        scopeType: "GLOBAL",
        scopeId: "",
        target: "CANDIDATE",
        value: { endpoint: 123 },
      }),
    ).rejects.toThrow("插件配置校验失败");

    expect(createTransientServicesSpy).not.toHaveBeenCalled();
  });

  it("returns FAILED for services whose implementation mismatches the declared type", async () => {
    const incompatible = {
      getId: () => "broken-llm",
      getType: () => "LLM_PROVIDER" as const,
      getModelName: () => "broken-llm",
    };
    const manager = makeManager(
      async () => [incompatible],
      [{ id: "broken-llm", type: "LLM_PROVIDER" }],
    );
    vi.spyOn(PluginManager, "get").mockReturnValue(manager);
    mockDetailQueries();

    const result = await probePluginConfig(createContext(manager), {
      pluginId: PLUGIN_ID,
      scopeType: "GLOBAL",
      scopeId: "",
      target: "CANDIDATE",
    });

    expect(result.results[0]?.status).toBe("FAILED");
    expect(result.results[0]?.error?.message).toBe(
      "插件服务实现与声明的类型不匹配。",
    );
  });
});
