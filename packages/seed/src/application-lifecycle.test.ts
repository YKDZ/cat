import { resolve } from "node:path";

import { sql } from "@cat/db";
import { PluginManager, type PluginLoader } from "@cat/plugin-core";
import { setupTestDB, type TestDB } from "@cat/test-utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadDevSeed } from "./loader.ts";
import { runFixtureHydration } from "./pipeline.ts";

type ApplicationBootstrap = (options: {
  database: TestDB;
  pluginManager: PluginManager;
}) => Promise<void>;

const loadApplicationBootstrap = async (): Promise<ApplicationBootstrap> => {
  const module = await import(
    new URL(
      "../../../apps/app/src/server/application-data-bootstrap.ts",
      import.meta.url,
    ).href
  );
  const bootstrap = Reflect.get(module, "bootstrapApplicationData");
  if (typeof bootstrap !== "function") {
    throw new Error("Application bootstrap export is unavailable");
  }
  return bootstrap as ApplicationBootstrap;
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

describe("application data lifecycle", () => {
  let database: TestDB;

  beforeAll(async () => {
    database = await setupTestDB();
  });

  afterAll(async () => {
    PluginManager.clear();
    await database?.cleanup();
  });

  it("prepares schema, bootstraps twice, and hydrates fixtures without changing schema", async () => {
    const vectorSchemaBefore = await database.client.execute(sql`
      SELECT table_schema, column_name, udt_name, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'Vector'
      ORDER BY ordinal_position
    `);

    const bootstrap = await loadApplicationBootstrap();
    const loader = await loadApplicationPluginLoader();
    const manager = PluginManager.get("GLOBAL", "", loader);
    await bootstrap({ database, pluginManager: manager });

    PluginManager.clear();
    const restartManager = PluginManager.get(
      "GLOBAL",
      "",
      await loadApplicationPluginLoader(),
    );
    await bootstrap({
      database,
      pluginManager: restartManager,
    });

    const seedDir = resolve(
      import.meta.dirname,
      "../../../tools/seeder/datasets/e2e",
    );
    const result = await runFixtureHydration(
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

    const vectorSchemaAfter = await database.client.execute(sql`
      SELECT table_schema, column_name, udt_name, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'Vector'
      ORDER BY ordinal_position
    `);

    expect(result.refs.getStringId("project")).toBeTruthy();
    expect(vectorSchemaAfter.rows).toEqual(vectorSchemaBefore.rows);
  });
});
