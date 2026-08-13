import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bootstrapDeployment: vi.fn().mockResolvedValue({ status: "applied" }),
  createAppPluginLoader: vi.fn(() => Symbol("plugin-loader")),
  disconnect: vi.fn().mockResolvedValue(undefined),
  getDbHandle: vi.fn(),
  pluginManagerClear: vi.fn(),
  pluginManagerGet: vi.fn(),
  serverLogger: Symbol("server-logger"),
}));

vi.mock("@cat/domain", () => ({ getDbHandle: mocks.getDbHandle }));
vi.mock("@cat/plugin-core", () => ({
  PluginManager: {
    clear: mocks.pluginManagerClear,
    get: mocks.pluginManagerGet,
  },
}));
vi.mock("@cat/server-shared", () => ({ serverLogger: mocks.serverLogger }));
vi.mock("./bootstrap-deployment.ts", () => ({
  bootstrapDeployment: mocks.bootstrapDeployment,
}));
vi.mock("./default-plugins/catalog.ts", () => ({
  createAppPluginLoader: mocks.createAppPluginLoader,
}));

import { runBootstrapOnly } from "./bootstrap-only.ts";

describe("bootstrap-only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bootstrapDeployment.mockResolvedValue({ status: "applied" });
    mocks.disconnect.mockResolvedValue(undefined);
  });

  it("runs the deployment bootstrap without creating an HTTP server and closes the database handle", async () => {
    const database = {
      client: Symbol("database-client"),
      disconnect: mocks.disconnect,
    };
    const pluginManager = Symbol("plugin-manager");
    mocks.getDbHandle.mockResolvedValue(database);
    mocks.pluginManagerGet.mockReturnValue(pluginManager);

    await expect(runBootstrapOnly()).resolves.toEqual({ status: "applied" });

    expect(mocks.pluginManagerClear).toHaveBeenCalledOnce();
    expect(mocks.pluginManagerGet).toHaveBeenCalledWith(
      "GLOBAL",
      "",
      expect.any(Symbol),
      mocks.serverLogger,
    );
    expect(mocks.createAppPluginLoader).toHaveBeenCalledWith(
      mocks.serverLogger,
    );
    expect(mocks.bootstrapDeployment).toHaveBeenCalledWith({
      database,
      pluginManager,
    });
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });

  it("closes the database handle when bootstrap fails", async () => {
    const database = {
      client: Symbol("database-client"),
      disconnect: mocks.disconnect,
    };
    mocks.getDbHandle.mockResolvedValue(database);
    mocks.bootstrapDeployment.mockRejectedValueOnce(new Error("plan failed"));

    await expect(runBootstrapOnly()).rejects.toThrow("plan failed");
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });
});
