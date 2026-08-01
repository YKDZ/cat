import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureDB: vi.fn().mockResolvedValue(undefined),
  ensureRootUser: vi.fn().mockResolvedValue(undefined),
  ensureCoreRelationTypes: Symbol("ensureCoreRelationTypes"),
  executeCommand: vi.fn().mockResolvedValue(undefined),
  executeQuery: vi.fn().mockResolvedValue({ id: "root-user" }),
  getDefaultPluginIds: vi.fn(() => [
    "password-auth-provider",
    "spacy-language-analyzer",
  ]),
  getFirstRegisteredUser: Symbol("getFirstRegisteredUser"),
  getLanguageAnalysisSelection: Symbol("getLanguageAnalysisSelection"),
  grantFirstUserSuperadmin: vi.fn().mockResolvedValue(undefined),
  installDefaults: vi.fn().mockResolvedValue(undefined),
  registerBuiltinAgents: vi.fn().mockResolvedValue(undefined),
  seedSystemRoles: vi.fn().mockResolvedValue(undefined),
  validateLanguageAnalyzerConfiguration: vi.fn(),
  writeValidatedLanguageAnalysisSelection: Symbol(
    "writeValidatedLanguageAnalysisSelection",
  ),
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
  getLanguageAnalysisSelection: mocks.getLanguageAnalysisSelection,
  LanguageAnalysisSelectionConflictError: class extends Error {},
  writeValidatedLanguageAnalysisSelection:
    mocks.writeValidatedLanguageAnalysisSelection,
}));

vi.mock("@cat/operations", () => ({
  validateLanguageAnalyzerConfiguration:
    mocks.validateLanguageAnalyzerConfiguration,
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
      "spacy-language-analyzer",
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

  it("creates the default wildcard selection only when no administrator record exists", async () => {
    const client = {
      transaction: vi.fn(async (callback: (tx: object) => Promise<void>) =>
        callback({}),
      ),
    };
    const implementation = {
      pluginId: "spacy-language-analyzer",
      scopeId: "",
      scopeType: "GLOBAL" as const,
      serviceId: "spacy-language-analyzer",
      serviceType: "LANGUAGE_ANALYZER" as const,
    };
    mocks.executeQuery.mockImplementation(async (_ctx, query) =>
      query === mocks.getLanguageAnalysisSelection ? null : { id: "root-user" },
    );
    mocks.validateLanguageAnalyzerConfiguration.mockResolvedValue({
      fingerprint: `sha256:${"a".repeat(64)}`,
    });
    const pluginManager = {
      createServiceImplementationReference: vi.fn(() => implementation),
      getDiscovery: () => ({ syncDefinitions: vi.fn() }),
      getServices: vi.fn(() => [
        {
          id: "spacy-language-analyzer",
          pluginId: "spacy-language-analyzer",
        },
      ]),
      restore: vi.fn(),
    };

    await bootstrapApplicationData({
      database: { client } as never,
      pluginManager: pluginManager as never,
    });

    expect(mocks.executeCommand).toHaveBeenCalledWith(
      { db: client },
      mocks.writeValidatedLanguageAnalysisSelection,
      expect.objectContaining({
        expectedRevision: 0,
        implementation,
        key: "*",
      }),
    );
  });
});
