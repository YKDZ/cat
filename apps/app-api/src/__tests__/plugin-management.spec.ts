import { executeCommand, executeQuery } from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
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
  updatePluginConfigInstanceValue,
  updatePluginConfigInstanceValueIfUnchanged,
} from "@cat/domain";

import {
  getPluginDetailModel,
  reloadPluginRuntime,
  savePluginConfigAndApply,
} from "@/services/plugin-management";

const PLUGIN_ID = "no-config-plugin";

const createContext = (manager: PluginManager): Context => {
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
  };
};

describe("plugin-management service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    PluginManager.clear();
  });

  it("returns a normal detail model for a plugin without config", async () => {
    const manager = PluginManager.get("GLOBAL", "");
    vi.spyOn(manager.getLoader(), "getManifest").mockResolvedValue({
      id: PLUGIN_ID,
      version: "0.0.1",
      entry: "index.js",
      services: [{ id: "tokenizer", type: "TOKENIZER", dynamic: false }],
    });
    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === getPlugin) {
        return {
          id: PLUGIN_ID,
          name: "no-config-plugin",
          overview: "No config",
          isExternal: false,
          entry: "index.js",
          iconUrl: null,
          version: "0.0.1",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      if (query === getPluginConfig) return null;
      if (query === getPluginInstallation) return { id: 1 };
      if (query === listPluginServicesForInstallation) return [];
      return null;
    });

    const detail = await getPluginDetailModel(createContext(manager), {
      pluginId: PLUGIN_ID,
      scopeType: "GLOBAL",
      scopeId: "",
    });

    expect(detail?.config.hasConfig).toBe(false);
    expect(detail?.config.value).toEqual({});
    expect(detail?.runtimeStatus).toBe("INACTIVE");
  });

  it("reloadPluginRuntime uses the long-lived client handle", async () => {
    const manager = PluginManager.get("GLOBAL", "");
    const context = createContext(manager);
    const reloadSpy = vi.spyOn(manager, "reloadPlugin").mockResolvedValue();

    await reloadPluginRuntime(context, {
      pluginId: PLUGIN_ID,
      scopeType: "GLOBAL",
      scopeId: "",
    });

    expect(reloadSpy).toHaveBeenCalledWith(context.drizzleDB.client, PLUGIN_ID);
  });

  it("rejects stale config saves with a conflict", async () => {
    const manager = PluginManager.get("GLOBAL", "");
    const updatedAt = new Date("2026-05-16T00:00:00.000Z");
    vi.spyOn(manager.getLoader(), "getManifest").mockResolvedValue({
      id: PLUGIN_ID,
      version: "0.0.1",
      entry: "index.js",
      config: { type: "object", properties: { endpoint: { type: "string" } } },
    });
    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === getPlugin) {
        return {
          id: PLUGIN_ID,
          name: "plugin",
          overview: "Plugin",
          isExternal: false,
          entry: "index.js",
          iconUrl: null,
          version: "0.0.1",
          createdAt: updatedAt,
          updatedAt,
        };
      }
      if (query === getPluginConfig) {
        return {
          id: 10,
          pluginId: PLUGIN_ID,
          schema: { type: "object" },
          createdAt: updatedAt,
          updatedAt,
        };
      }
      if (query === getPluginInstallation) return { id: 1 };
      if (query === getPluginConfigInstance) {
        return {
          id: 2,
          value: {},
          creatorId: null,
          configId: 10,
          pluginInstallationId: 1,
          createdAt: updatedAt,
          updatedAt,
        };
      }
      if (query === listPluginServicesForInstallation) return [];
      return null;
    });
    vi.mocked(executeCommand).mockImplementation(async (_ctx, command) => {
      if (command === updatePluginConfigInstanceValueIfUnchanged) return null;
      return undefined;
    });

    await expect(
      savePluginConfigAndApply(createContext(manager), {
        pluginId: PLUGIN_ID,
        scopeType: "GLOBAL",
        scopeId: "",
        value: { endpoint: "http://new" },
        expectedUpdatedAt: updatedAt.toISOString(),
      }),
    ).rejects.toThrow("插件配置已被其他请求修改");
  });

  it("rolls back config when hot apply fails", async () => {
    const manager = PluginManager.get("GLOBAL", "");
    const updatedAt = new Date("2026-05-16T00:00:00.000Z");
    vi.spyOn(manager.getLoader(), "getManifest").mockResolvedValue({
      id: PLUGIN_ID,
      version: "0.0.1",
      entry: "index.js",
    });
    vi.spyOn(manager, "reloadPlugin")
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce();

    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === getPlugin)
        return {
          id: PLUGIN_ID,
          name: "plugin",
          overview: "Plugin",
          isExternal: false,
          entry: "index.js",
          iconUrl: null,
          version: "0.0.1",
          createdAt: updatedAt,
          updatedAt,
        };
      if (query === getPluginConfig)
        return {
          id: 10,
          pluginId: PLUGIN_ID,
          schema: { type: "object" },
          createdAt: updatedAt,
          updatedAt,
        };
      if (query === getPluginInstallation) return { id: 1 };
      if (query === getPluginConfigInstance)
        return {
          id: 2,
          value: { endpoint: "old" },
          creatorId: null,
          configId: 10,
          pluginInstallationId: 1,
          createdAt: updatedAt,
          updatedAt,
        };
      if (query === listPluginServicesForInstallation) return [];
      return null;
    });
    vi.mocked(executeCommand).mockImplementation(async (_ctx, command) => {
      if (command === updatePluginConfigInstanceValueIfUnchanged) {
        return {
          id: 2,
          value: { endpoint: "new" },
          creatorId: null,
          configId: 10,
          pluginInstallationId: 1,
          createdAt: updatedAt,
          updatedAt: new Date(),
        };
      }
      if (command === updatePluginConfigInstanceValue) return undefined;
      return undefined;
    });

    const result = await savePluginConfigAndApply(createContext(manager), {
      pluginId: PLUGIN_ID,
      scopeType: "GLOBAL",
      scopeId: "",
      value: { endpoint: "new" },
      expectedUpdatedAt: updatedAt.toISOString(),
    });

    expect(result.status).toBe("ROLLED_BACK");
    expect(vi.mocked(executeCommand)).toHaveBeenCalledWith(
      expect.anything(),
      updatePluginConfigInstanceValue,
      { instanceId: 2, value: { endpoint: "old" } },
    );
  });

  it("marks runtime degraded when rollback restore fails", async () => {
    const manager = PluginManager.get("GLOBAL", "");
    const updatedAt = new Date("2026-05-16T00:00:00.000Z");
    vi.spyOn(manager.getLoader(), "getManifest").mockResolvedValue({
      id: PLUGIN_ID,
      version: "0.0.1",
      entry: "index.js",
    });
    vi.spyOn(manager, "reloadPlugin")
      .mockRejectedValueOnce(new Error("apiKey=sk-secret"))
      .mockRejectedValueOnce(new Error("rollback failed"));

    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === getPlugin)
        return {
          id: PLUGIN_ID,
          name: "plugin",
          overview: "Plugin",
          isExternal: false,
          entry: "index.js",
          iconUrl: null,
          version: "0.0.1",
          createdAt: updatedAt,
          updatedAt,
        };
      if (query === getPluginConfig)
        return {
          id: 10,
          pluginId: PLUGIN_ID,
          schema: { type: "object" },
          createdAt: updatedAt,
          updatedAt,
        };
      if (query === getPluginInstallation) return { id: 1 };
      if (query === getPluginConfigInstance)
        return {
          id: 2,
          value: { endpoint: "old" },
          creatorId: null,
          configId: 10,
          pluginInstallationId: 1,
          createdAt: updatedAt,
          updatedAt,
        };
      if (query === listPluginServicesForInstallation) return [];
      return null;
    });
    vi.mocked(executeCommand).mockImplementation(async (_ctx, command) => {
      if (command === updatePluginConfigInstanceValueIfUnchanged) {
        return {
          id: 2,
          value: { endpoint: "new" },
          creatorId: null,
          configId: 10,
          pluginInstallationId: 1,
          createdAt: updatedAt,
          updatedAt: new Date(),
        };
      }
      if (command === updatePluginConfigInstanceValue) return undefined;
      return undefined;
    });

    const context = createContext(manager);
    const result = await savePluginConfigAndApply(context, {
      pluginId: PLUGIN_ID,
      scopeType: "GLOBAL",
      scopeId: "",
      value: { endpoint: "new" },
      expectedUpdatedAt: updatedAt.toISOString(),
    });

    expect(result.status).toBe("ROLLBACK_FAILED");

    const detail = await getPluginDetailModel(context, {
      pluginId: PLUGIN_ID,
      scopeType: "GLOBAL",
      scopeId: "",
    });

    expect(detail?.runtimeStatus).toBe("DEGRADED");
    expect(detail?.runtime.lastError).not.toContain("sk-secret");
    expect(detail?.actions.canRetryApply).toBe(true);
  });
});
