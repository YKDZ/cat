import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureDB: vi.fn().mockResolvedValue(undefined),
  ensureRootUser: vi.fn().mockResolvedValue(undefined),
  ensureCoreRelationTypes: Symbol("ensureCoreRelationTypes"),
  executeCommand: vi.fn().mockResolvedValue(undefined),
  executeQuery: vi.fn().mockResolvedValue({ id: "root-user" }),
  getDefaultPluginIds: vi.fn(() => [
    "password-auth-provider",
    "spacy-segmenter",
  ]),
  getFirstRegisteredUser: Symbol("getFirstRegisteredUser"),
  grantFirstUserSuperadmin: vi.fn().mockResolvedValue(undefined),
  installDefaults: vi.fn().mockResolvedValue(undefined),
  registerBuiltinAgents: vi.fn().mockResolvedValue(undefined),
  seedSystemRoles: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@cat/agent", () => ({
  registerBuiltinAgents: mocks.registerBuiltinAgents,
}));

vi.mock("@cat/db", () => ({
  ensureDB: mocks.ensureDB,
  ensureRootUser: mocks.ensureRootUser,
}));

vi.mock("@cat/domain", () => ({
  ensureCoreRelationTypes: mocks.ensureCoreRelationTypes,
  executeCommand: mocks.executeCommand,
  executeQuery: mocks.executeQuery,
  getFirstRegisteredUser: mocks.getFirstRegisteredUser,
}));

vi.mock("@cat/permissions", () => ({
  grantFirstUserSuperadmin: mocks.grantFirstUserSuperadmin,
  seedSystemRoles: mocks.seedSystemRoles,
}));

vi.mock("@cat/plugin-core", () => ({
  PluginManager: { installDefaults: mocks.installDefaults },
}));

vi.mock("./default-plugins/catalog.ts", () => ({
  getDefaultPluginIds: mocks.getDefaultPluginIds,
}));

import { bootstrapApplicationData } from "./application-data-bootstrap.ts";

describe("bootstrapApplicationData", () => {
  it("idempotently supplies application data without a schema capability", async () => {
    const client = {
      transaction: vi.fn(async (callback: (tx: object) => Promise<void>) =>
        callback({}),
      ),
    };
    const database = { client };
    const syncDefinitions = vi.fn().mockResolvedValue(undefined);
    const restore = vi.fn().mockResolvedValue(undefined);
    const pluginManager = {
      getDiscovery: () => ({ syncDefinitions }),
      restore,
    };

    await bootstrapApplicationData({
      database: database as never,
      pluginManager: pluginManager as never,
    });

    expect(mocks.ensureDB).toHaveBeenCalledWith(database);
    expect(syncDefinitions).toHaveBeenCalledWith(client);
    expect(mocks.installDefaults).toHaveBeenCalledWith(client, pluginManager, [
      "password-auth-provider",
      "spacy-segmenter",
    ]);
    expect(restore).toHaveBeenCalledWith(client);
    expect(mocks.ensureRootUser).toHaveBeenCalledOnce();
    expect(mocks.seedSystemRoles).toHaveBeenCalledWith(client);
    expect(mocks.executeCommand).toHaveBeenCalledWith(
      { db: client },
      mocks.ensureCoreRelationTypes,
      {},
    );
    expect(mocks.registerBuiltinAgents).toHaveBeenCalledWith(client);
    expect(mocks.grantFirstUserSuperadmin).toHaveBeenCalledWith(
      client,
      "root-user",
    );
  });
});
