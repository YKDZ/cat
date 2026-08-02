import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  bootstrapReceipt,
  pluginConfigInstance,
  pluginInstallation,
  sql,
} from "@cat/db";
import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  applyBootstrapPlan,
  registerPluginDefinition,
  type BootstrapPlan,
  BootstrapPlanSchema,
} from "#/commands/index.ts";
import { executeCommand } from "#/executor.ts";
import { setupTestDB, type TestDB } from "#/testing/setup-test-db.ts";

let testDb: TestDB;

const pluginId = (suffix: string): string =>
  `bootstrap-plan-${suffix}-${randomUUID()}`;

const registerConfigurablePlugin = async (
  id: string,
  configSchema: Record<string, unknown> = {
    type: "object",
    additionalProperties: false,
    required: ["endpoint"],
    properties: {
      endpoint: { type: "string", format: "uri" },
    },
  },
): Promise<void> => {
  await executeCommand({ db: testDb.client }, registerPluginDefinition, {
    pluginId: id,
    version: "1.0.0",
    name: id,
    overview: "Bootstrap plan test plugin",
    entry: "dist/index.js",
    iconUrl: null,
    configVersion: "1",
    configSchema,
  });
};

const planFor = (id: string, key: string = randomUUID()): BootstrapPlan => ({
  version: "1",
  idempotencyKey: key,
  operations: [
    {
      type: "install-if-absent" as const,
      pluginId: id,
      scopeType: "GLOBAL" as const,
      scopeId: "",
      value: { endpoint: "http://spacy.internal:8000" },
    },
  ],
});

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

beforeAll(async () => {
  testDb = await setupTestDB();
});

afterAll(async () => {
  await testDb?.cleanup();
});

describe("bootstrap plans", () => {
  test("accepts only the current strict envelope and operation grammar", () => {
    expect(
      BootstrapPlanSchema.safeParse(planFor("strict", "strict-v1")),
    ).toMatchObject({
      success: true,
    });
    for (const plan of [
      { ...planFor("strict", "future-v1"), version: "future-v999" },
      { ...planFor("strict", "unknown-v1"), ignored: true },
      {
        ...planFor("strict", "operation-unknown-v1"),
        operations: [{ ...planFor("strict").operations[0], typo: true }],
      },
    ]) {
      expect(BootstrapPlanSchema.safeParse(plan).success).toBe(false);
    }
  });

  test("atomically installs absent plugins with their validated configuration and a digest-only receipt", async () => {
    const id = pluginId("first");
    await registerConfigurablePlugin(id);

    const applied = await executeCommand(
      { db: testDb.client },
      applyBootstrapPlan,
      planFor(id, "official-spacy-v1"),
    );

    expect(applied).toEqual({ status: "applied" });
    const installations = await testDb.client
      .select()
      .from(pluginInstallation)
      .where(eq(pluginInstallation.pluginId, id));
    expect(installations).toHaveLength(1);

    const instances = await testDb.client
      .select()
      .from(pluginConfigInstance)
      .where(
        eq(pluginConfigInstance.pluginInstallationId, installations[0]!.id),
      );
    expect(instances).toMatchObject([
      { value: { endpoint: "http://spacy.internal:8000" }, revision: 1 },
    ]);

    const receipts = await testDb.client
      .select()
      .from(bootstrapReceipt)
      .where(eq(bootstrapReceipt.idempotencyKey, "official-spacy-v1"));
    expect(receipts).toMatchObject([
      {
        planVersion: "1",
        inputDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        schemaDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        pluginDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        appliedAt: expect.any(Date),
      },
    ]);
    expect(JSON.stringify(receipts[0])).not.toContain("spacy.internal");
  });

  test("treats a matching retry as a no-op and rejects a changed input for the same key", async () => {
    const id = pluginId("retry");
    const plan = planFor(id, "official-spacy-retry-v1");
    const operation = plan.operations[0];
    if (!operation) throw new Error("bootstrap plan needs one operation");
    await registerConfigurablePlugin(id);

    await executeCommand({ db: testDb.client }, applyBootstrapPlan, plan);
    await expect(
      executeCommand({ db: testDb.client }, applyBootstrapPlan, plan),
    ).resolves.toEqual({ status: "noop" });

    await expect(
      executeCommand({ db: testDb.client }, applyBootstrapPlan, {
        ...plan,
        operations: [
          {
            ...operation,
            value: { endpoint: "http://other.internal:8000" },
          },
        ],
      }),
    ).rejects.toThrow("idempotency key was already used with different input");
  });

  test("fails closed for a pre-existing unmanaged installation", async () => {
    const id = pluginId("unmanaged");
    await registerConfigurablePlugin(id);
    await testDb.client.insert(pluginInstallation).values({
      pluginId: id,
      scopeType: "GLOBAL",
      scopeId: "",
    });

    await expect(
      executeCommand(
        { db: testDb.client },
        applyBootstrapPlan,
        planFor(id, "official-spacy-unmanaged-v1"),
      ),
    ).rejects.toThrow("unmanaged installation already exists");

    await expect(
      testDb.client
        .select()
        .from(bootstrapReceipt)
        .where(
          eq(bootstrapReceipt.idempotencyKey, "official-spacy-unmanaged-v1"),
        ),
    ).resolves.toEqual([]);
  });

  test("rolls back earlier install-if-absent operations when a later operation fails", async () => {
    const id = pluginId("rollback");
    await registerConfigurablePlugin(id);
    const key = "official-spacy-rollback-v1";

    await expect(
      executeCommand({ db: testDb.client }, applyBootstrapPlan, {
        ...planFor(id, key),
        operations: [
          ...planFor(id, key).operations,
          {
            type: "install-if-absent",
            pluginId: "missing-plugin",
            scopeType: "GLOBAL",
            scopeId: "",
            value: { endpoint: "http://missing.internal:8000" },
          },
        ],
      }),
    ).rejects.toThrow("has no available configuration definition");

    const installations = await testDb.client
      .select({ installationId: pluginInstallation.id })
      .from(pluginInstallation)
      .where(
        and(
          eq(pluginInstallation.pluginId, id),
          eq(pluginInstallation.scopeType, "GLOBAL"),
        ),
      );
    expect(installations).toEqual([]);
    await expect(
      testDb.client
        .select()
        .from(bootstrapReceipt)
        .where(eq(bootstrapReceipt.idempotencyKey, key)),
    ).resolves.toEqual([]);
  });

  test("rejects secret-bearing schemas recursively, including array references", async () => {
    const id = pluginId("secret-schema");
    await registerConfigurablePlugin(id, {
      type: "object",
      additionalProperties: false,
      required: ["endpoints"],
      properties: {
        endpoints: {
          type: "array",
          items: { $ref: "#/$defs/credential" },
        },
      },
      $defs: {
        credential: {
          type: "object",
          additionalProperties: false,
          properties: {
            endpoint: { type: "string" },
            api: { type: "string", "x-secret": true },
            opaque: { type: "string", writeOnly: true },
          },
        },
      },
    });

    await expect(
      executeCommand({ db: testDb.client }, applyBootstrapPlan, {
        ...planFor(id, "secret-schema-v1"),
        operations: [
          {
            ...planFor(id).operations[0]!,
            value: { endpoints: [{ endpoint: "http://safe.internal" }] },
          },
        ],
      }),
    ).rejects.toThrow("secret configuration");
  });

  test("rejects schemas that cannot prove unknown properties are non-secret", async () => {
    const id = pluginId("open-schema");
    await registerConfigurablePlugin(id, {
      type: "object",
      required: ["endpoint"],
      properties: { endpoint: { type: "string", format: "uri" } },
    });

    await expect(
      executeCommand(
        { db: testDb.client },
        applyBootstrapPlan,
        planFor(id, "open-schema-v1"),
      ),
    ).rejects.toThrow("cannot prove");
  });

  test("rejects sensitive value keys even when an open value schema is otherwise safe", async () => {
    const id = pluginId("secret-value");
    await registerConfigurablePlugin(id, {
      type: "object",
      additionalProperties: { type: "string" },
      required: ["endpoint"],
      properties: { endpoint: { type: "string", format: "uri" } },
    });

    await expect(
      executeCommand({ db: testDb.client }, applyBootstrapPlan, {
        ...planFor(id, "secret-value-v1"),
        operations: [
          {
            ...planFor(id).operations[0]!,
            value: {
              endpoint: "http://safe.internal:8000",
              apiKey: "must-not-be-persisted",
            },
          },
        ],
      }),
    ).rejects.toThrow("secret configuration value");
  });

  test("serializes concurrent retries with the same key", async () => {
    const id = pluginId("same-key");
    await registerConfigurablePlugin(id);
    const plan = planFor(id, "same-key-concurrent-v1");

    const results = await withConcurrentClients(
      async (first, second) =>
        await Promise.all([
          executeCommand({ db: first }, applyBootstrapPlan, plan),
          executeCommand({ db: second }, applyBootstrapPlan, plan),
        ]),
    );
    expect(results.map((result) => result.status).sort()).toEqual([
      "applied",
      "noop",
    ]);
    await expect(
      testDb.client
        .select()
        .from(bootstrapReceipt)
        .where(eq(bootstrapReceipt.idempotencyKey, plan.idempotencyKey)),
    ).resolves.toHaveLength(1);
  });

  test("rejects a concurrent different digest for the same key", async () => {
    const id = pluginId("same-key-digest");
    await registerConfigurablePlugin(id);
    const first = planFor(id, "same-key-digest-v1");
    const second = {
      ...first,
      operations: [
        {
          ...first.operations[0]!,
          value: { endpoint: "http://different.internal:8000" },
        },
      ],
    };

    const results = await withConcurrentClients(
      async (firstClient, secondClient) =>
        await Promise.allSettled([
          executeCommand({ db: firstClient }, applyBootstrapPlan, first),
          executeCommand({ db: secondClient }, applyBootstrapPlan, second),
        ]),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(results).toContainEqual(
      expect.objectContaining({
        status: "rejected",
        reason: expect.objectContaining({
          message: expect.stringContaining("different input"),
        }),
      }),
    );
  });

  test("allows only one concurrent plan to claim the same plugin scope", async () => {
    const id = pluginId("different-key");
    await registerConfigurablePlugin(id);

    const results = await withConcurrentClients(
      async (first, second) =>
        await Promise.allSettled([
          executeCommand(
            { db: first },
            applyBootstrapPlan,
            planFor(id, "different-key-first-v1"),
          ),
          executeCommand(
            { db: second },
            applyBootstrapPlan,
            planFor(id, "different-key-second-v1"),
          ),
        ]),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(results).toContainEqual(
      expect.objectContaining({
        status: "rejected",
        reason: expect.objectContaining({
          message: expect.stringContaining(
            "unmanaged installation already exists",
          ),
        }),
      }),
    );
  });

  test("rolls back installation and configuration when receipt persistence fails", async () => {
    const id = pluginId("receipt-rollback");
    await registerConfigurablePlugin(id);
    await testDb.client.execute(sql`
      CREATE FUNCTION reject_bootstrap_receipt() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'receipt persistence rejected';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_bootstrap_receipt
      BEFORE INSERT ON "BootstrapReceipt"
      FOR EACH ROW EXECUTE FUNCTION reject_bootstrap_receipt();
    `);

    await expect(
      executeCommand(
        { db: testDb.client },
        applyBootstrapPlan,
        planFor(id, "receipt-rollback-v1"),
      ),
    ).rejects.toThrow("receipt persistence rejected");
    await expect(
      testDb.client
        .select()
        .from(pluginInstallation)
        .where(eq(pluginInstallation.pluginId, id)),
    ).resolves.toEqual([]);
  });

  test("applies the bootstrap receipt migration to an existing schema", async () => {
    const migrationsFolder = await mkdtemp(
      join(tmpdir(), "cat-bootstrap-migration-"),
    );
    const migrationsSchema = `test_migrations_${randomUUID().replaceAll("-", "_")}`;
    const migrationName = "20260713041213_fluffy_plazm";
    const targetDirectory = join(migrationsFolder, migrationName);
    try {
      await mkdir(targetDirectory);
      await copyFile(
        resolve(
          import.meta.dirname,
          "../../../../db/drizzle",
          migrationName,
          "migration.sql",
        ),
        join(targetDirectory, "migration.sql"),
      );
      await testDb.client.execute(sql`DROP TABLE "BootstrapReceipt"`);

      await migrate(testDb.client, { migrationsFolder, migrationsSchema });

      await expect(
        testDb.client.select().from(bootstrapReceipt),
      ).resolves.toEqual([]);
    } finally {
      await testDb.client.execute(
        sql`DROP SCHEMA IF EXISTS ${sql.identifier(migrationsSchema)} CASCADE`,
      );
      await rm(migrationsFolder, { force: true, recursive: true });
    }
  });
});
