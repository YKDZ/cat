import type { FullConfig } from "@playwright/test";
// oxlint-disable no-console -- intentional diagnostic logging in globalSetup

import {
  DrizzleDB,
  ensureDB,
  RedisConnection,
  sql,
  vectorizedString,
} from "@cat/db";
import {
  createPR,
  createQaReviewRunWithFindings,
  createTranslations,
  executeCommand,
  materializeQaReviewQueueItem,
  updatePRStatus,
} from "@cat/domain";
import {
  type RefResolver,
  loadDevSeed,
  runSeedPipeline,
  truncateAllTables,
} from "@cat/seed";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const E2E_REFS_PATH = resolve(
  import.meta.dirname,
  "test-results/e2e-refs.json",
);

const PRESERVED_PLUGIN_TABLES = [
  "Plugin",
  "PluginConfig",
  "PluginConfigInstance",
  "PluginInstallation",
  "PluginService",
  "PluginComponent",
];

const validateDatabaseUrl = (): string => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "[e2e globalSetup] DATABASE_URL is not set. " +
        "Create apps/app-e2e/.env with DATABASE_URL pointing to a database " +
        'whose name contains "e2e" or "test".',
    );
  }

  if (process.env.E2E_SKIP_DB_CHECK === "true") {
    console.log(
      "[e2e globalSetup] E2E_SKIP_DB_CHECK=true — skipping database name validation.",
    );
    return url;
  }

  // Extract database name from URL: postgresql://user:pass@host:port/DBNAME?params
  const dbName = new URL(url).pathname.slice(1).split("?")[0];
  if (!dbName.includes("e2e") && !dbName.includes("test")) {
    throw new Error(
      `[e2e globalSetup] DATABASE_URL database name "${dbName}" does not contain "e2e" or "test". ` +
        "Refusing to run E2E tests against a potential production/development database. " +
        "Set E2E_SKIP_DB_CHECK=true to bypass this check (CI only).",
    );
  }

  return url;
};

const insertString = async (
  db: DrizzleDB["client"],
  value: string,
  languageId: string,
) => {
  const [row] = await db
    .insert(vectorizedString)
    .values({ value, languageId })
    .returning({ id: vectorizedString.id });

  return row.id;
};

const seedQaReviewWorkbench = async (
  execCtx: { db: DrizzleDB["client"] },
  refs: RefResolver,
) => {
  const projectId = refs.getStringId("project");
  const adminId = refs.getStringId("user:admin");
  const firstElementId = refs.getNumericId("el:001");
  const secondElementId = refs.getNumericId("el:002");

  const [firstStringId, secondStringId] = await Promise.all([
    insertString(execCtx.db, "QA approved candidate", "zh-Hans"),
    insertString(execCtx.db, "QA rejected candidate", "zh-Hans"),
  ]);

  const [firstTranslationId, secondTranslationId] = await executeCommand(
    execCtx,
    createTranslations,
    {
      data: [
        {
          translatableElementId: firstElementId,
          translatorId: adminId,
          stringId: firstStringId,
        },
        {
          translatableElementId: secondElementId,
          translatorId: adminId,
          stringId: secondStringId,
        },
      ],
    },
  );

  await Promise.all(
    [
      {
        elementId: firstElementId,
        translationId: firstTranslationId,
        message: "Missing placeholder",
        action: "BLOCK_APPROVAL" as const,
        riskScore: 100,
      },
      {
        elementId: secondElementId,
        translationId: secondTranslationId,
        message: "Needs style review",
        action: "NEEDS_REVIEW" as const,
        riskScore: 60,
      },
    ].map(async (item) => {
      await executeCommand(execCtx, createQaReviewRunWithFindings, {
        projectId,
        elementId: item.elementId,
        translationId: item.translationId,
        branchId: null,
        layer: "DETERMINISTIC",
        status: "COMPLETED",
        riskScore: item.riskScore,
        summary: item.message,
        findings: [
          {
            layer: "DETERMINISTIC",
            checkerServiceId: null,
            qaResultItemId: null,
            ruleId: "e2e.qa",
            ruleFamily: "e2e",
            severity: item.action === "BLOCK_APPROVAL" ? "error" : "warning",
            action: item.action,
            disposition: "OPEN",
            confidenceBasisPoints: 10000,
            riskScore: item.riskScore,
            message: item.message,
            explanation: null,
            sourceSpan: null,
            targetSpan: null,
            suggestedText: null,
            meta: null,
          },
        ],
      });

      await executeCommand(execCtx, materializeQaReviewQueueItem, {
        projectId,
        languageId: "zh-Hans",
        elementId: item.elementId,
        translationId: item.translationId,
        branchId: null,
      });
    }),
  );

  refs.set("qa:element:approve", firstElementId);
  refs.set("qa:element:reject", secondElementId);
};

const seedBranchWorkspace = async (
  execCtx: { db: DrizzleDB["client"] },
  refs: RefResolver,
) => {
  const projectId = refs.getStringId("project");
  const adminId = refs.getStringId("user:admin");

  const pr = await executeCommand(execCtx, createPR, {
    projectId,
    title: "E2E branch workspace",
    body: "Branch workspace E2E fixture",
    authorId: adminId,
    reviewers: [],
    branchName: "e2e/branch-workspace",
  });

  const opened = await executeCommand(execCtx, updatePRStatus, {
    prId: pr.id,
    status: "OPEN",
  });

  refs.set("pr:branch-workspace", opened.id);
  refs.set("pr:branch-workspace:number", opened.number);
  refs.set("branch:workspace", opened.branchId);
};

/**
 * With Direction B, initialization is performed at server startup in
 * server/initialize.ts before the HTTP server starts. By the time Playwright's
 * webServer confirms /_health returns 200, domain event handlers are already
 * registered and no manual warmup is needed.
 */

const globalSetup = async (_config: FullConfig): Promise<void> => {
  // 1. Validate DATABASE_URL
  validateDatabaseUrl();

  // 2. Connect to database
  const drizzleDB = new DrizzleDB();
  await drizzleDB.connect();
  console.log("[e2e globalSetup] Connected to database.");

  try {
    const execCtx = { db: drizzleDB.client };

    // 3. Truncate all tables
    console.log("[e2e globalSetup] Truncating all tables...");
    await truncateAllTables(execCtx, {
      excludeTables: PRESERVED_PLUGIN_TABLES,
    });

    // 3a. Clear stale PostgreSQL queues (prevents server startup hang during crash recovery)
    await drizzleDB.client
      .execute(
        sql`
          DELETE FROM "RuntimeQueueTask" WHERE queue_name = 'vectorization'
        `,
      )
      .then(() => {
        console.log(
          "[e2e globalSetup] Cleared PostgreSQL vectorization queue.",
        );
      })
      .catch(() => undefined);

    // 3b. Clear stale Redis queues when configured.
    if (process.env.REDIS_URL) {
      const redis = new RedisConnection();
      await redis.connect();
      await redis.redis.del("queue:vectorization:pending");
      await redis.redis.del("queue:vectorization:processing");
      redis.disconnect();
      console.log("[e2e globalSetup] Cleared Redis vectorization queues.");
    }

    // 3c. Remove stale auth storage-state files (from a previous DB seed)
    const authDir = resolve(import.meta.dirname, "test-results/.auth");
    await rm(authDir, { recursive: true, force: true });

    // 4. Ensure base data (languages, settings)
    await ensureDB(drizzleDB);
    console.log("[e2e globalSetup] Base data ensured.");

    // 5. Load E2E dataset
    const datasetDir = resolve(
      import.meta.dirname,
      "../../tools/seeder/datasets/e2e",
    );
    const loadedSeed = loadDevSeed(datasetDir);
    console.log(
      `[e2e globalSetup] Dataset "${loadedSeed.config.name}" loaded.`,
    );

    // 6. Run seed pipeline
    const pluginsDir = resolve(import.meta.dirname, "../../@cat-plugin");
    const defaultPluginsJsonPath = resolve(
      import.meta.dirname,
      "../../apps/app/default-plugins.json",
    );
    const cacheDir = resolve(datasetDir, "../../.vector-cache");

    const result = await runSeedPipeline(execCtx, loadedSeed, {
      pluginsDir,
      defaultPluginsJsonPath,
      cacheDir,
      skipVectorization: true,
      skipPluginBootstrap: true,
    });

    console.log(
      `[e2e globalSetup] Seed complete: ${result.summary.users} users, ` +
        `${result.summary.elements} elements, ${result.summary.glossaryConcepts} glossary concepts, ` +
        `${result.summary.memoryItems} memory items.`,
    );

    await seedQaReviewWorkbench(execCtx, result.refs);
    await seedBranchWorkspace(execCtx, result.refs);

    // 7. Write refs JSON
    const refs: Record<string, string> = {};
    for (const [ref, id] of result.refs.entries()) {
      refs[ref] = String(id);
    }

    await mkdir(resolve(import.meta.dirname, "test-results"), {
      recursive: true,
    });
    await writeFile(E2E_REFS_PATH, JSON.stringify(refs, null, 2), "utf-8");
    console.log(`[e2e globalSetup] Refs written to: ${E2E_REFS_PATH}`);
    console.log("[e2e globalSetup] Refs:", refs);
  } finally {
    await drizzleDB.disconnect();
  }
};

export default globalSetup;
