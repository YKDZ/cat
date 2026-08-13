import { mkdtemp, mkdir, rm } from "node:fs/promises";
// @vitest-environment node
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import localStoragePlugin from "@cat-plugin/local-storage-provider";
import spacyPlugin from "@cat-plugin/spacy-language-analyzer";
import app, { configureReadinessReporter } from "@cat/app-api/app";
import type { ReadinessReport } from "@cat/app-api/readiness";
import { DrizzleDB, RedisConnection } from "@cat/db";
import {
  assessDatabaseRequirements,
  PostgresCacheStore,
  PostgresSessionStore,
  PostgresTaskQueue,
  resolveRuntimeProfile,
} from "@cat/domain";
import {
  LanguageAnalyzer,
  StorageProvider,
  type CatPlugin,
  type PluginContext,
} from "@cat/plugin-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApplicationReadinessReporter } from "./readiness.ts";

const spacyServerUrl = process.env.SPACY_SERVER_URL;

const requireSpacyServerUrl = (): string => {
  if (spacyServerUrl === undefined) {
    throw new Error("SPACY_SERVER_URL is required for readiness integration");
  }
  return spacyServerUrl;
};

const pluginServices = (plugin: CatPlugin, config: PluginContext["config"]) => {
  // These Plugin Entries only consume config in this runtime-boundary test.
  const services = plugin.services?.({
    config,
    scopeId: "",
    scopeType: "GLOBAL",
  } as PluginContext);
  if (services === undefined || services instanceof Promise) {
    throw new Error("Expected a synchronous Plugin Entry services hook");
  }
  return services;
};

const createStorageService = (rootPath: string): StorageProvider => {
  const service = pluginServices(localStoragePlugin, {
    "root-path": rootPath,
  }).find((candidate) => candidate instanceof StorageProvider);
  if (service === undefined) throw new Error("Storage Plugin Entry is missing");
  return service;
};

const createSpacyService = (
  config: PluginContext["config"],
): LanguageAnalyzer => {
  const service = pluginServices(spacyPlugin, config).find(
    (candidate) => candidate instanceof LanguageAnalyzer,
  );
  if (service === undefined) throw new Error("spaCy Plugin Entry is missing");
  return service;
};

type HealthServer = {
  close: () => Promise<void>;
  url: string;
};

const LANGUAGE_ANALYSIS_READY_RECOVERY_TIMEOUT_MS = 10_000;
const EXPENSIVE_READINESS_RETRY_INTERVAL_MS = 1_100;
const READINESS_LIFECYCLE_EVENTUAL_READY_CHECKS = 5;
const READINESS_LIFECYCLE_TEST_CLEANUP_MARGIN_MS = 10_000;
// Initial readiness plus each of the four recovery checks may use the bounded
// Language Analysis eventual-readiness wait. Vitest remains the outer ceiling.
const READINESS_LIFECYCLE_TEST_TIMEOUT_MS =
  READINESS_LIFECYCLE_EVENTUAL_READY_CHECKS *
    LANGUAGE_ANALYSIS_READY_RECOVERY_TIMEOUT_MS +
  READINESS_LIFECYCLE_TEST_CLEANUP_MARGIN_MS;

type ReadinessResponse = Pick<ReadinessReport, "components" | "status">;
type ReadinessWaitOutcome = "permanent-failure" | "ready" | "retryable";

const startHealthServer = async (): Promise<HealthServer> => {
  const server = createServer((request, response) => {
    void (async (): Promise<void> => {
      try {
        const headers = new Headers();
        for (const [name, value] of Object.entries(request.headers)) {
          if (value !== undefined) {
            headers.set(name, Array.isArray(value) ? value.join(",") : value);
          }
        }
        const result = await app.fetch(
          new Request(`http://127.0.0.1${request.url ?? "/"}`, {
            headers,
            method: request.method ?? "GET",
          }),
        );
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(Buffer.from(await result.arrayBuffer()));
      } catch {
        response.writeHead(500).end();
      }
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to bind the readiness integration server");
  }
  return {
    close: async () =>
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
    url: `http://127.0.0.1:${address.port}`,
  };
};

const healthJson = async (
  server: HealthServer,
  path: "/_health/live" | "/_health/ready",
): Promise<{ body: unknown; status: number }> => {
  const response = await fetch(`${server.url}${path}`);
  return { body: await response.json(), status: response.status };
};

const startReadinessSequenceServer = async (
  responses: readonly ReadinessReport[],
): Promise<HealthServer & { requestCount: () => number }> => {
  let requestCount = 0;
  const server = createServer((_request, response) => {
    const body = responses[Math.min(requestCount, responses.length - 1)];
    requestCount += 1;
    if (body === undefined) {
      response.writeHead(500).end();
      return;
    }
    response
      .writeHead(body.status === "ready" ? 200 : 503, {
        "content-type": "application/json",
      })
      .end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to bind the readiness sequence server");
  }
  return {
    close: async () =>
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
    requestCount: () => requestCount,
    url: `http://127.0.0.1:${address.port}`,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isReadinessFailureReport = (
  value: unknown,
): value is ReadinessResponse => {
  if (!isRecord(value) || !isRecord(value.components)) return false;
  if (value.status !== "degraded" && value.status !== "not-ready") return false;
  return Object.values(value.components).every(
    (component) =>
      isRecord(component) &&
      typeof component.code === "string" &&
      typeof component.required === "boolean" &&
      (component.status === "degraded" ||
        component.status === "failed" ||
        component.status === "ready"),
  );
};

const hasTransientLanguageAnalysisTimeout = (result: {
  body: unknown;
  status: number;
}): boolean => {
  if (result.status !== 503 || !isReadinessFailureReport(result.body))
    return false;
  const failed = Object.entries(result.body.components).filter(
    ([, component]) => component.required && component.status === "failed",
  );
  const failure = failed[0];
  return (
    failed.length === 1 &&
    failure?.[0] === "language-analysis" &&
    (failure[1].code === "TIMEOUT" || failure[1].code === "DEADLINE_EXCEEDED")
  );
};

const expectReady = async (
  server: HealthServer,
  phase: string,
): Promise<void> => {
  let result = await healthJson(server, "/_health/ready");
  if (result.status !== 200) {
    if (!hasTransientLanguageAnalysisTimeout(result)) {
      throw new Error(
        `${phase} readiness failed: ${JSON.stringify(result.body)}`,
      );
    }
    let permanentFailure: string | undefined;
    try {
      await expect
        .poll(
          async () => {
            result = await healthJson(server, "/_health/ready");
            if (result.status === 200) return "ready" as const;
            if (hasTransientLanguageAnalysisTimeout(result))
              return "retryable" as const;
            permanentFailure = `${phase} readiness failed: ${JSON.stringify(result.body)}`;
            return "permanent-failure" as const;
          },
          {
            interval: EXPENSIVE_READINESS_RETRY_INTERVAL_MS,
            timeout: LANGUAGE_ANALYSIS_READY_RECOVERY_TIMEOUT_MS,
          },
        )
        .not.toBe("retryable" satisfies ReadinessWaitOutcome);
    } catch (error) {
      throw new Error(
        `${phase} readiness did not recover within ${LANGUAGE_ANALYSIS_READY_RECOVERY_TIMEOUT_MS}ms: ${JSON.stringify(result.body)}`,
        { cause: error },
      );
    }
    if (permanentFailure !== undefined) throw new Error(permanentFailure);
  }
  if (result.status !== 200) {
    throw new Error(
      `${phase} readiness failed: ${JSON.stringify(result.body)}`,
    );
  }
  expect(result.body).toMatchObject({ status: "ready" });
};

describe.skipIf(spacyServerUrl === undefined)("readiness integration", () => {
  let database: DrizzleDB;
  let redis: RedisConnection;
  let server: HealthServer;
  let storageDirectory: string;
  let storage: StorageProvider;
  let spacy: LanguageAnalyzer;

  const configure = (): void => {
    const profile = resolveRuntimeProfile({
      CAT_CACHE_BACKEND: "postgres",
      CAT_QUEUE_BACKEND: "postgres",
      CAT_RUNTIME_PROFILE: "production",
      CAT_SESSION_BACKEND: "postgres",
    });
    configureReadinessReporter(
      createApplicationReadinessReporter({
        backends: {
          cacheStore: new PostgresCacheStore(database.client),
          sessionStore: new PostgresSessionStore(database.client),
          vectorizationQueue: new PostgresTaskQueue(
            database.client,
            "readiness-integration",
          ),
        },
        database,
        assessDatabaseRequirements: async () =>
          await assessDatabaseRequirements(database.client),
        getRuntimeState: () => ({
          database: {
            requirements: [
              { id: "POSTGRESQL_CORE", status: "SATISFIED" },
              {
                id: "POSTGRESQL_TRIGRAM_MATCHING",
                status: "SATISFIED",
              },
              { id: "POSTGRESQL_VECTOR_STORAGE", status: "SATISFIED" },
            ],
          },
          initializedAt: new Date().toISOString(),
          profile,
        }),
        profile,
        redis,
        assessLanguageAnalysis: async (signal) => {
          const configuration =
            spacy.getLanguageAnalysisConfigurationAssessment();
          if (configuration.status === "INVALID") {
            throw new Error("Language Analysis configuration is invalid");
          }
          const languageId = configuration.supportedLanguages[0];
          if (languageId === undefined) {
            throw new Error("Language Analyzer has no supported language");
          }
          await spacy.analyze({
            languageId,
            signal,
            text: "CAT Language Analysis readiness probe.",
          });
        },
        storageServices: () => [storage],
      }),
    );
  };

  const expectUnavailableThenRecovered = async (
    component: string,
    interrupt: () => Promise<void>,
    recover: () => Promise<void>,
  ): Promise<void> => {
    await interrupt();
    configure();
    const unavailable = await healthJson(server, "/_health/ready");
    expect(unavailable.status).toBe(503);
    expect(unavailable.body).toMatchObject({
      components: { [component]: { status: "failed" } },
      status: "not-ready",
    });
    await expect(healthJson(server, "/_health/live")).resolves.toMatchObject({
      body: { status: "live" },
      status: 200,
    });

    await recover();
    configure();
    await expectReady(server, `${component} recovery`);
  };

  beforeEach(async () => {
    Reflect.set(globalThis, "inited", true);
    database = new DrizzleDB();
    await database.connect();
    redis = new RedisConnection({ mode: "fail-fast", onError: () => {} });
    await redis.connect();
    storageDirectory = await mkdtemp(
      join(tmpdir(), "cat-readiness-integration-"),
    );
    storage = createStorageService(storageDirectory);
    await storage.connect();
    spacy = createSpacyService({ serverUrl: requireSpacyServerUrl() });
    configure();
    server = await startHealthServer();
  });

  afterEach(async () => {
    configureReadinessReporter(undefined);
    Reflect.deleteProperty(globalThis, "inited");
    await Promise.allSettled([
      database?.disconnect(),
      Promise.resolve(redis?.disconnect()),
      server?.close(),
      storageDirectory
        ? rm(storageDirectory, { force: true, recursive: true })
        : Promise.resolve(),
    ]);
  });

  it(
    "reports actual PostgreSQL, Redis, storage, and spaCy failures while liveness remains available and each dependency recovers",
    async () => {
      await expectReady(server, "initial");

      await expectUnavailableThenRecovered(
        "postgres",
        async () => await database.disconnect(),
        async () => {
          database = new DrizzleDB();
          await database.connect();
        },
      );
      await expectUnavailableThenRecovered(
        "redis",
        async () => {
          redis.disconnect();
        },
        async () => {
          redis = new RedisConnection({
            mode: "fail-fast",
            onError: () => {},
          });
          await redis.connect();
        },
      );
      await expectUnavailableThenRecovered(
        "storage",
        async () =>
          await rm(storageDirectory, { force: true, recursive: true }),
        async () => {
          await mkdir(storageDirectory, { recursive: true });
        },
      );
      await expectUnavailableThenRecovered(
        "language-analysis",
        async () => {
          spacy = createSpacyService({
            serverUrl: "http://127.0.0.1:1",
            timeout: 100,
          });
        },
        async () => {
          spacy = createSpacyService({
            serverUrl: requireSpacyServerUrl(),
          });
        },
      );
    },
    READINESS_LIFECYCLE_TEST_TIMEOUT_MS,
  );

  it("does not hide a persistent language analysis failure behind the startup wait", async () => {
    spacy = createSpacyService({
      serverUrl: "http://127.0.0.1:1",
      timeout: 100,
    });
    configure();

    await expect(
      expectReady(server, "persistent language analysis"),
    ).rejects.toThrow(/LANGUAGE_ANALYSIS_UNAVAILABLE/);
  });

  it("stops readiness recovery immediately when a transient dependency timeout becomes a hard failure", async () => {
    const sequence = await startReadinessSequenceServer([
      {
        components: {
          "language-analysis": {
            code: "TIMEOUT",
            durationMs: 2_000,
            required: true,
            status: "failed",
          },
        },
        profile: "production",
        status: "not-ready",
      },
      {
        components: {
          postgres: {
            code: "DATABASE_UNAVAILABLE",
            durationMs: 1,
            required: true,
            status: "failed",
          },
        },
        profile: "production",
        status: "not-ready",
      },
    ]);
    try {
      await expect(
        expectReady(sequence, "changing dependency"),
      ).rejects.toThrow(/DATABASE_UNAVAILABLE/);
      expect(sequence.requestCount()).toBe(2);
    } finally {
      await sequence.close();
    }
  });
});
