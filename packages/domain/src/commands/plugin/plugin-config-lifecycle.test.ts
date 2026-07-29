import { randomUUID } from "node:crypto";

import {
  pluginConfig,
  pluginConfigInstance,
  pluginInstallation,
  user,
} from "@cat/db";
import type { _JSONSchema } from "@cat/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  installPlugin,
  migratePluginConfigInstance,
  registerPluginDefinition,
  writePluginConfigInstance,
} from "#/commands/index.ts";
import { executeCommand } from "#/executor.ts";
import { requireFixtureValue } from "#/testing/require-fixture-value.ts";
import { setupTestDB, type TestDB } from "#/testing/setup-test-db.ts";

let testDb: TestDB;

const CREATOR_ID = randomUUID();
const schemaV1: _JSONSchema = {
  type: "object",
  properties: { endpoint: { type: "string", default: "http://old" } },
  required: ["endpoint"],
};
const schemaV2: _JSONSchema = {
  type: "object",
  properties: { endpoint: { type: "string", format: "uri" } },
  required: ["endpoint"],
};
const schemaV2Drift: _JSONSchema = {
  type: "object",
  properties: { endpoint: { type: "string", minLength: 8 } },
  required: ["endpoint"],
};
const requiredSchemaWithoutDefaults: _JSONSchema = {
  type: "object",
  properties: { endpoint: { type: "string" } },
  required: ["endpoint"],
};

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
  await executeCommand({ db: testDb.client }, registerPluginDefinition, {
    pluginId,
    version: "0.0.1",
    name: "plugin-config-test",
    overview: "Plugin config lifecycle test",
    entry: "dist/index.js",
    iconUrl: null,
    configSchema: schemaV1,
    configVersion: "1",
  });
  await executeCommand({ db: testDb.client }, installPlugin, {
    pluginId,
    scopeType: "GLOBAL",
    scopeId: "",
  });

  const [definition] = await testDb.client
    .select()
    .from(pluginConfig)
    .where(eq(pluginConfig.pluginId, pluginId));
  const [installation] = await testDb.client
    .select()
    .from(pluginInstallation)
    .where(eq(pluginInstallation.pluginId, pluginId));
  const [instance] = await testDb.client
    .select()
    .from(pluginConfigInstance)
    .where(
      and(
        eq(pluginConfigInstance.configId, requireFixtureValue(definition).id),
        eq(
          pluginConfigInstance.pluginInstallationId,
          requireFixtureValue(installation).id,
        ),
      ),
    );

  return {
    pluginId,
    definition: requireFixtureValue(definition),
    installation: requireFixtureValue(installation),
    instance: requireFixtureValue(instance),
  };
};

const withConcurrentClients = async <T>(
  callback: (
    first: Awaited<ReturnType<typeof testDb.openConcurrentClient>>["client"],
    second: Awaited<ReturnType<typeof testDb.openConcurrentClient>>["client"],
  ) => Promise<T>,
): Promise<T> => {
  const [first, second] = await Promise.all([
    testDb.openConcurrentClient(),
    testDb.openConcurrentClient(),
  ]);
  try {
    return await callback(first.client, second.client);
  } finally {
    await Promise.all([first.cleanup(), second.cleanup()]);
  }
};

describe("plugin config lifecycle commands", () => {
  test("records independent schema version and digest, and rejects same-version drift", async () => {
    const { pluginId, definition } = await seedInstalledPlugin();

    expect(definition.schemaVersion).toBe("1");
    expect(definition.schemaDigest).toHaveLength(64);

    await expect(
      executeCommand({ db: testDb.client }, registerPluginDefinition, {
        pluginId,
        version: "2.0.0",
        name: "plugin-config-test",
        overview: "Plugin config lifecycle test",
        entry: "dist/index.js",
        iconUrl: null,
        configSchema: schemaV2,
        configVersion: "1",
      }),
    ).rejects.toThrow("digest without a version change");
  });

  test("requires a validated explicit migration before stale config can be written", async () => {
    const { pluginId, instance } = await seedInstalledPlugin();

    await executeCommand({ db: testDb.client }, registerPluginDefinition, {
      pluginId,
      version: "0.0.2",
      name: "plugin-config-test",
      overview: "Plugin config lifecycle test",
      entry: "dist/index.js",
      iconUrl: null,
      configSchema: schemaV2,
      configVersion: "2",
    });
    const [definition] = await testDb.client
      .select()
      .from(pluginConfig)
      .where(eq(pluginConfig.pluginId, pluginId));

    const staleWrite = await executeCommand(
      { db: testDb.client },
      writePluginConfigInstance,
      {
        pluginId,
        scopeType: "GLOBAL",
        scopeId: "",
        creatorId: CREATOR_ID,
        value: { endpoint: "https://new.example" },
        expectedSchemaVersion: "2",
        expectedSchemaDigest: requireFixtureValue(definition).schemaDigest,
        expectedRevision: instance.revision,
      },
    );
    expect(staleWrite).toBeNull();

    const migrated = await executeCommand(
      { db: testDb.client },
      migratePluginConfigInstance,
      {
        instanceId: instance.id,
        expectedRevision: instance.revision,
        fromVersion: "1",
        expectedSchemaDigest: requireFixtureValue(definition).schemaDigest,
        value: { endpoint: "https://new.example" },
      },
    );
    expect(migrated).toMatchObject({ appliedVersion: "2", revision: 2 });

    const invalidMigration = await executeCommand(
      { db: testDb.client },
      migratePluginConfigInstance,
      {
        instanceId: instance.id,
        expectedRevision: 2,
        fromVersion: "1",
        expectedSchemaDigest: requireFixtureValue(definition).schemaDigest,
        value: { endpoint: "invalid" },
      },
    );
    expect(invalidMigration).toBeNull();
  });

  test("uses revision compare-and-swap for writes and rollback", async () => {
    const { pluginId, definition, instance } = await seedInstalledPlugin();
    const updated = await executeCommand(
      { db: testDb.client },
      writePluginConfigInstance,
      {
        pluginId,
        scopeType: "GLOBAL",
        scopeId: "",
        creatorId: CREATOR_ID,
        value: { endpoint: "http://new" },
        expectedSchemaVersion: "1",
        expectedSchemaDigest: definition.schemaDigest,
        expectedRevision: instance.revision,
      },
    );
    expect(updated).toMatchObject({ revision: instance.revision + 1 });

    const stale = await executeCommand(
      { db: testDb.client },
      writePluginConfigInstance,
      {
        pluginId,
        scopeType: "GLOBAL",
        scopeId: "",
        creatorId: CREATOR_ID,
        value: { endpoint: "http://stale" },
        expectedSchemaVersion: "1",
        expectedSchemaDigest: definition.schemaDigest,
        expectedRevision: instance.revision,
      },
    );
    expect(stale).toBeNull();

    const rollback = await executeCommand(
      { db: testDb.client },
      writePluginConfigInstance,
      {
        pluginId,
        scopeType: "GLOBAL",
        scopeId: "",
        creatorId: CREATOR_ID,
        value: instance.value,
        expectedSchemaVersion: "1",
        expectedSchemaDigest: definition.schemaDigest,
        expectedRevision: requireFixtureValue(updated).revision,
      },
    );
    expect(rollback).toMatchObject({ revision: instance.revision + 2 });
  });

  test("allows exactly one concurrent writer and rejects the losing rollback", async () => {
    const { pluginId, definition, instance } = await seedInstalledPlugin();
    const write = (value: string, expectedRevision: number) =>
      executeCommand({ db: testDb.client }, writePluginConfigInstance, {
        pluginId,
        scopeType: "GLOBAL",
        scopeId: "",
        creatorId: CREATOR_ID,
        value: { endpoint: value },
        expectedSchemaVersion: definition.schemaVersion,
        expectedSchemaDigest: definition.schemaDigest,
        expectedRevision,
      });

    const concurrentWrites = await Promise.all([
      write("http://first", instance.revision),
      write("http://second", instance.revision),
    ]);
    const winner = requireFixtureValue(concurrentWrites.find(Boolean));
    expect(concurrentWrites.filter(Boolean)).toHaveLength(1);

    const concurrentRollbacks = await Promise.all([
      write("http://old", winner.revision),
      write("http://other", winner.revision),
    ]);
    expect(concurrentRollbacks.filter(Boolean)).toHaveLength(1);
  });

  test("serializes concurrent definition registration and rejects same-version drift", async () => {
    const { pluginId } = await seedInstalledPlugin();
    const results = await withConcurrentClients(
      async (first, second) =>
        await Promise.allSettled([
          executeCommand({ db: first }, registerPluginDefinition, {
            pluginId,
            version: "0.0.2",
            name: "plugin-config-test",
            overview: "Plugin config lifecycle test",
            entry: "dist/index.js",
            iconUrl: null,
            configSchema: schemaV2,
            configVersion: "2",
          }),
          executeCommand({ db: second }, registerPluginDefinition, {
            pluginId,
            version: "0.0.2",
            name: "plugin-config-test",
            overview: "Plugin config lifecycle test",
            entry: "dist/index.js",
            iconUrl: null,
            configSchema: schemaV2Drift,
            configVersion: "2",
          }),
        ]),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });

  test("fails installation rather than persisting an invalid default configuration", async () => {
    const pluginId = `plugin-config-required-${randomUUID()}`;
    await executeCommand({ db: testDb.client }, registerPluginDefinition, {
      pluginId,
      version: "0.0.1",
      name: "plugin-config-required",
      overview: "Plugin config lifecycle test",
      entry: "dist/index.js",
      iconUrl: null,
      configSchema: requiredSchemaWithoutDefaults,
      configVersion: "1",
    });

    await expect(
      executeCommand({ db: testDb.client }, installPlugin, {
        pluginId,
        scopeType: "GLOBAL",
        scopeId: "",
      }),
    ).rejects.toThrow("no complete default value");
    expect(
      await testDb.client
        .select()
        .from(pluginInstallation)
        .where(eq(pluginInstallation.pluginId, pluginId)),
    ).toHaveLength(0);
  });

  test("preserves configuration when its creator is deleted", async () => {
    const { pluginId, definition, instance } = await seedInstalledPlugin();
    const owned = await executeCommand(
      { db: testDb.client },
      writePluginConfigInstance,
      {
        pluginId,
        scopeType: "GLOBAL",
        scopeId: "",
        creatorId: CREATOR_ID,
        value: instance.value,
        expectedSchemaVersion: definition.schemaVersion,
        expectedSchemaDigest: definition.schemaDigest,
        expectedRevision: instance.revision,
      },
    );
    await testDb.client.delete(user).where(eq(user.id, CREATOR_ID));

    const [persisted] = await testDb.client
      .select()
      .from(pluginConfigInstance)
      .where(eq(pluginConfigInstance.id, requireFixtureValue(owned).id));
    expect(persisted).toMatchObject({ id: owned?.id, creatorId: null });
  });

  test("marks a withdrawn definition unavailable and restores operator values when reintroduced", async () => {
    const { pluginId, installation, instance } = await seedInstalledPlugin();
    await executeCommand({ db: testDb.client }, registerPluginDefinition, {
      pluginId,
      version: "0.0.2",
      name: "plugin-config-test",
      overview: "Plugin config lifecycle test",
      entry: "dist/index.js",
      iconUrl: null,
      configVersion: "1",
    });

    const [withdrawn] = await testDb.client
      .select()
      .from(pluginConfig)
      .where(eq(pluginConfig.pluginId, pluginId));
    const instances = await testDb.client
      .select()
      .from(pluginConfigInstance)
      .where(eq(pluginConfigInstance.pluginInstallationId, installation.id));
    expect(withdrawn).toMatchObject({ isAvailable: false });
    expect(instances).toMatchObject([{ id: instance.id }]);

    await executeCommand({ db: testDb.client }, registerPluginDefinition, {
      pluginId,
      version: "0.0.3",
      name: "plugin-config-test",
      overview: "Plugin config lifecycle test",
      entry: "dist/index.js",
      iconUrl: null,
      configSchema: schemaV1,
      configVersion: "1",
    });
    const reintroduced = await testDb.client
      .select()
      .from(pluginConfig)
      .where(eq(pluginConfig.pluginId, pluginId));
    expect(reintroduced).toMatchObject([{ isAvailable: true }]);
    const preservedInstance = await testDb.client
      .select()
      .from(pluginConfigInstance)
      .where(eq(pluginConfigInstance.pluginInstallationId, installation.id));
    expect(preservedInstance).toMatchObject([{ id: instance.id }]);
  });
});
