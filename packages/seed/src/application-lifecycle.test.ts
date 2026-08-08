import { resolve } from "node:path";

import { contentNode, DrizzleDB, eq, sql } from "@cat/db";
import {
  executeQuery,
  getLanguageAnalysisSelection,
  type BootstrapPlan,
} from "@cat/domain";
import { validateLanguageAnalyzerConfiguration } from "@cat/operations";
import { PluginManager, type PluginLoader } from "@cat/plugin-core";
import { LanguageAnalysisWildcardSelectionKey } from "@cat/shared";
import { setupTestDB, type TestDB } from "@cat/test-utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadDevSeed } from "./loader.ts";
import { runFixtureHydration } from "./pipeline.ts";

type DeploymentBootstrap = (
  options: {
    database: TestDB;
    pluginManager: PluginManager;
  },
  plan: BootstrapPlan,
) => Promise<{ status: "applied" | "noop" }>;

const loadDeploymentBootstrap = async (): Promise<DeploymentBootstrap> => {
  const module = await import(
    new URL(
      "../../../apps/app/src/server/bootstrap-deployment.ts",
      import.meta.url,
    ).href
  );
  const bootstrap = Reflect.get(module, "bootstrapDeployment");
  if (typeof bootstrap !== "function") {
    throw new Error("Deployment bootstrap export is unavailable");
  }
  return bootstrap as DeploymentBootstrap;
};

const loadApplicationPluginLoader = async (): Promise<PluginLoader> => {
  const module = await import(
    new URL(
      "../../../apps/app/src/server/default-plugins/catalog.ts",
      import.meta.url,
    ).href
  );
  const createLoader = Reflect.get(module, "createAppPluginLoader");
  if (typeof createLoader !== "function") {
    throw new Error("Application plugin catalog export is unavailable");
  }
  return (createLoader as () => PluginLoader)();
};

const requireSpacyServerUrl = (): string => {
  const value = process.env.SPACY_SERVER_URL;
  if (value === undefined || value.trim() === "") {
    throw new Error(
      "SPACY_SERVER_URL is required for the seed application lifecycle integration test",
    );
  }
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      "SPACY_SERVER_URL must use http or https for the seed application lifecycle integration test",
    );
  }
  return url.toString();
};

describe("application data lifecycle", () => {
  let database: TestDB;
  let spacyServerUrl: string;

  beforeAll(async () => {
    spacyServerUrl = requireSpacyServerUrl();
    database = await setupTestDB();
  });

  afterAll(async () => {
    PluginManager.clear();
    await database?.cleanup();
  });

  it("applies deployment bootstrap once and hydrates fixtures without changing schema", async () => {
    const vectorSchemaBefore = await database.client.execute(sql`
      SELECT table_schema, column_name, udt_name, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'Vector'
      ORDER BY ordinal_position
    `);

    const bootstrap = await loadDeploymentBootstrap();
    const plan = {
      idempotencyKey: "seed-application-lifecycle-spacy-v1",
      operations: [
        {
          pluginId: "spacy-language-analyzer",
          scopeId: "",
          scopeType: "GLOBAL",
          type: "install-if-absent",
          value: { serverUrl: spacyServerUrl },
        },
      ],
      version: "1",
    } satisfies BootstrapPlan;
    const loader = await loadApplicationPluginLoader();
    const manager = PluginManager.get("GLOBAL", "", loader);
    await expect(
      bootstrap({ database, pluginManager: manager }, plan),
    ).resolves.toEqual({ status: "applied" });

    PluginManager.clear();
    const restartManager = PluginManager.get(
      "GLOBAL",
      "",
      await loadApplicationPluginLoader(),
    );
    await expect(
      bootstrap({ database, pluginManager: restartManager }, plan),
    ).resolves.toEqual({ status: "noop" });
    const selection = await executeQuery(
      { db: database.client },
      getLanguageAnalysisSelection,
      { key: LanguageAnalysisWildcardSelectionKey },
    );
    if (selection?.implementation === null || selection === null) {
      throw new Error(
        "Deployment bootstrap did not publish a wildcard Language Analysis selection",
      );
    }
    expect(selection.implementation).toMatchObject({
      pluginId: "spacy-language-analyzer",
      serviceId: "spacy-language-analyzer",
      serviceType: "LANGUAGE_ANALYZER",
    });
    const validatedConfiguration = await validateLanguageAnalyzerConfiguration(
      selection.implementation,
      {
        pluginManager: restartManager,
        traceId: "seed-application-lifecycle-selection",
      },
    );
    expect(selection.configurationFingerprint).toBe(
      validatedConfiguration.fingerprint,
    );

    const seedDir = resolve(
      import.meta.dirname,
      "../../../tools/seeder/datasets/e2e",
    );
    const registeredDatabase = globalThis.__DRIZZLE_DB__;
    const testDatabaseUrl = process.env.TEST_DATABASE_URL;
    if (testDatabaseUrl === undefined) {
      throw new Error(
        "TEST_DATABASE_URL is required for this integration test",
      );
    }
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const wrongDatabase = new DrizzleDB(testDatabaseUrl);
    await wrongDatabase.connect();
    globalThis.__DRIZZLE_DB__ = wrongDatabase;
    process.env.DATABASE_URL = testDatabaseUrl;
    let result: Awaited<ReturnType<typeof runFixtureHydration>>;
    try {
      result = await runFixtureHydration(
        { db: database.client },
        loadDevSeed(seedDir),
        {
          cacheDir: resolve(seedDir, "../../.vector-cache"),
          defaultPluginsJsonPath: resolve(
            import.meta.dirname,
            "../../../apps/app/default-plugins.json",
          ),
          pluginsDir: resolve(import.meta.dirname, "../../../@cat-plugin"),
        },
      );
    } finally {
      globalThis.__DRIZZLE_DB__ = registeredDatabase;
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      await wrongDatabase.disconnect();
    }

    const vectorSchemaAfter = await database.client.execute(sql`
      SELECT table_schema, column_name, udt_name, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'Vector'
      ORDER BY ordinal_position
    `);

    expect(result.refs.getStringId("project")).toBeTruthy();
    expect(result.refs.getStringId("glossary")).toBe(result.glossaryId);
    expect(result.refs.getStringId("memory")).toBe(result.memoryId);
    if (result.contentNodeId === undefined) {
      throw new Error(
        "Fixture hydration did not create an elements content node",
      );
    }
    const [elementsNode] = await database.client
      .select({ languageId: contentNode.languageId })
      .from(contentNode)
      .where(eq(contentNode.id, result.contentNodeId));
    expect(elementsNode?.languageId).toBe("en");
    expect(vectorSchemaAfter.rows).toEqual(vectorSchemaBefore.rows);
  });
});
