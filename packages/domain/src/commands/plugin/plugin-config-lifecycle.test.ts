import {
  plugin,
  pluginConfig,
  pluginConfigInstance,
  pluginInstallation,
  user,
} from "@cat/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  updatePluginConfigInstanceValue,
  updatePluginConfigInstanceValueIfUnchanged,
} from "@/commands";
import { executeCommand } from "@/executor";
import { setupTestDB, type TestDB } from "@/testing/setup-test-db";

let testDb: TestDB;

const CREATOR_ID = randomUUID();

beforeAll(async () => {
  testDb = await setupTestDB();
  await testDb.client.insert(user).values({
    id: CREATOR_ID,
    name: "Plugin Config Tester",
    email: `plugin-config-${CREATOR_ID}@test.local`,
  });
});

afterAll(async () => {
  await testDb?.cleanup();
});

const seedInstalledPlugin = async () => {
  const pluginId = `plugin-config-test-${randomUUID()}`;
  await testDb.client.insert(plugin).values({
    id: pluginId,
    name: "plugin-config-test",
    overview: "Plugin config lifecycle test",
    isExternal: false,
    entry: "dist/index.js",
    iconUrl: null,
    version: "0.0.1",
  });

  const [config] = await testDb.client
    .insert(pluginConfig)
    .values({
      pluginId,
      schema: {
        type: "object",
        properties: { endpoint: { type: "string", default: "http://old" } },
      },
    })
    .returning();

  const [installation] = await testDb.client
    .insert(pluginInstallation)
    .values({ pluginId, scopeType: "GLOBAL", scopeId: "" })
    .returning();

  const [instance] = await testDb.client
    .insert(pluginConfigInstance)
    .values({
      configId: config.id,
      pluginInstallationId: installation.id,
      creatorId: CREATOR_ID,
      value: { endpoint: "http://old" },
    })
    .returning();

  return instance;
};

describe("plugin config lifecycle commands", () => {
  test("updates config only when expected updatedAt matches", async () => {
    const instance = await seedInstalledPlugin();

    const updated = await executeCommand(
      { db: testDb.client },
      updatePluginConfigInstanceValueIfUnchanged,
      {
        instanceId: instance.id,
        expectedUpdatedAt: instance.updatedAt,
        value: { endpoint: "http://new" },
      },
    );

    expect(updated?.value).toEqual({ endpoint: "http://new" });
    expect(updated?.updatedAt.getTime()).toBeGreaterThan(
      instance.updatedAt.getTime(),
    );

    const stale = await executeCommand(
      { db: testDb.client },
      updatePluginConfigInstanceValueIfUnchanged,
      {
        instanceId: instance.id,
        expectedUpdatedAt: instance.updatedAt,
        value: { endpoint: "http://stale" },
      },
    );

    expect(stale).toBeNull();
  });

  test("legacy update refreshes updatedAt", async () => {
    const instance = await seedInstalledPlugin();

    await executeCommand(
      { db: testDb.client },
      updatePluginConfigInstanceValue,
      { instanceId: instance.id, value: { endpoint: "http://legacy" } },
    );

    const [row] = await testDb.client
      .select()
      .from(pluginConfigInstance)
      .where(eq(pluginConfigInstance.id, instance.id));

    expect(row?.value).toEqual({ endpoint: "http://legacy" });
    expect(row?.updatedAt.getTime()).toBeGreaterThanOrEqual(
      instance.updatedAt.getTime(),
    );
  });
});
