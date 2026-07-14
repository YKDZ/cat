import { mkdtemp, mkdir, rm } from "node:fs/promises";
// @vitest-environment node
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Provider as LocalStorageProvider } from "@cat-plugin/local-storage-provider";
import { SpacyWordSegmenter } from "@cat-plugin/spacy-segmenter";
import app, { configureReadinessReporter } from "@cat/app-api/app";
import { DrizzleDB, RedisConnection } from "@cat/db";
import {
  resolveRuntimeProfile,
  type DatabaseRuntimeSummary,
} from "@cat/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApplicationReadinessReporter } from "./readiness.ts";
import { detectSearchRuntimeHealth } from "./search-runtime-health.ts";

const spacyServerUrl = process.env.SPACY_SERVER_URL;

const requireSpacyServerUrl = (): string => {
  if (spacyServerUrl === undefined) {
    throw new Error("SPACY_SERVER_URL is required for readiness integration");
  }
  return spacyServerUrl;
};

type HealthServer = {
  close: () => Promise<void>;
  url: string;
};

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

describe.skipIf(spacyServerUrl === undefined)("readiness integration", () => {
  let database: DrizzleDB;
  let redis: RedisConnection;
  let server: HealthServer;
  let storageDirectory: string;
  let storage: LocalStorageProvider;
  let spacy: SpacyWordSegmenter;

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
          cacheStore: {},
          sessionStore: {},
          vectorizationQueue: {},
        },
        database,
        detectSearchRuntime: async (): Promise<DatabaseRuntimeSummary> =>
          await detectSearchRuntimeHealth(database.client),
        getRuntimeState: () => ({
          database: {
            backend: "postgres-server",
            disabledFeatures: [],
            extensions: {
              pg_trgm: true,
              rum: true,
              vector: true,
              zhparser: true,
            },
            functions: { rum_ts_score: true },
            searchLevel: "full-search-runtime",
            textSearchConfigs: { cat_zh_hans: true },
            warnings: [],
          },
          initializedAt: new Date().toISOString(),
          profile,
        }),
        profile,
        redis,
        spaCyServices: () => [
          {
            id: "spacy-word-segmenter",
            pluginId: "spacy-segmenter",
            service: spacy,
          },
        ],
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
    await expect(healthJson(server, "/_health/ready")).resolves.toMatchObject({
      status: 200,
      body: { status: "ready" },
    });
  };

  beforeEach(async () => {
    Reflect.set(globalThis, "inited", true);
    database = new DrizzleDB();
    await database.connect();
    redis = new RedisConnection();
    await redis.connect();
    storageDirectory = await mkdtemp(
      join(tmpdir(), "cat-readiness-integration-"),
    );
    storage = new LocalStorageProvider({ "root-path": storageDirectory });
    await storage.connect();
    spacy = new SpacyWordSegmenter({ serverUrl: requireSpacyServerUrl() });
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

  it("reports actual PostgreSQL, Redis, storage, and spaCy failures while liveness remains available and each dependency recovers", async () => {
    await expect(healthJson(server, "/_health/ready")).resolves.toMatchObject({
      status: 200,
      body: { status: "ready" },
    });

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
        redis = new RedisConnection();
        await redis.connect();
      },
    );
    await expectUnavailableThenRecovered(
      "storage",
      async () => await rm(storageDirectory, { force: true, recursive: true }),
      async () => {
        await mkdir(storageDirectory, { recursive: true });
      },
    );
    await expectUnavailableThenRecovered(
      "spacy",
      async () => {
        spacy = new SpacyWordSegmenter({
          serverUrl: "http://127.0.0.1:1",
          timeout: 100,
        });
      },
      async () => {
        spacy = new SpacyWordSegmenter({
          serverUrl: requireSpacyServerUrl(),
        });
      },
    );
  });
});
