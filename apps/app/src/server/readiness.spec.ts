import { InMemoryTaskQueue } from "@cat/core";
import {
  MemoryCacheStore,
  MemorySessionStore,
  resolveRuntimeProfile,
  type RuntimeState,
} from "@cat/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApplicationReadinessReporter } from "./readiness.ts";

const profile = resolveRuntimeProfile({ CAT_RUNTIME_PROFILE: "lite" });
const runtimeState: RuntimeState = {
  database: {
    backend: "postgres-server",
    disabledFeatures: [],
    extensions: { pg_trgm: true, rum: true, vector: true, zhparser: true },
    functions: { rum_ts_score: true },
    searchLevel: "full-search-runtime",
    textSearchConfigs: { cat_zh_hans: true },
    warnings: [],
  },
  initializedAt: "2026-07-13T00:00:00.000Z",
  profile,
};

const createDependencies = (profileOverride = profile) => ({
  backends: {
    cacheStore: new MemoryCacheStore(),
    sessionStore: new MemorySessionStore(),
    vectorizationQueue: new InMemoryTaskQueue(),
  },
  database: {
    ping: async () => {},
  },
  detectSearchRuntime: async () => runtimeState.database,
  getRuntimeState: () => ({ ...runtimeState, profile: profileOverride }),
  profile: profileOverride,
  redis: undefined,
  spaCyServices: () => [
    {
      id: "spacy-word-segmenter",
      pluginId: "spacy-segmenter",
      service: {
        getSupportedLanguages: async () => ["en"],
        segment: async () => ({
          sentences: [],
          tokens: [
            {
              end: 3,
              isPunct: false,
              isStop: false,
              lemma: "cat",
              pos: "NOUN",
              start: 0,
              text: "CAT",
            },
          ],
        }),
      },
    },
  ],
  storageServices: () => [{ ping: async () => {} }],
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "inited");
});

describe("application readiness", () => {
  it("requires initialized Lite memory backends, storage, spaCy, and full PostgreSQL search without Redis", async () => {
    Reflect.set(globalThis, "inited", true);
    const report =
      await createApplicationReadinessReporter(createDependencies()).report();

    expect(report.status).toBe("ready");
    expect(report.components).toEqual(
      expect.objectContaining({
        bootstrap: expect.objectContaining({ status: "ready" }),
        cache: expect.objectContaining({ status: "ready" }),
        queue: expect.objectContaining({ status: "ready" }),
        session: expect.objectContaining({ status: "ready" }),
        spacy: expect.objectContaining({ status: "ready" }),
        storage: expect.objectContaining({ status: "ready" }),
      }),
    );
    expect(report.components.redis).toBeUndefined();
  });

  it("requires Redis in Production while keeping liveness independent", async () => {
    Reflect.set(globalThis, "inited", true);
    const production = resolveRuntimeProfile({
      CAT_RUNTIME_PROFILE: "production",
    });
    const report = await createApplicationReadinessReporter(
      createDependencies(production),
    ).report();

    expect(report.status).toBe("not-ready");
    expect(report.components.redis).toMatchObject({
      code: "REDIS_UNINITIALIZED",
      status: "failed",
    });
  });

  it("requires Redis for Production even when every profile backend uses PostgreSQL", async () => {
    Reflect.set(globalThis, "inited", true);
    const production = resolveRuntimeProfile({
      CAT_CACHE_BACKEND: "postgres",
      CAT_QUEUE_BACKEND: "postgres",
      CAT_RUNTIME_PROFILE: "production",
      CAT_SESSION_BACKEND: "postgres",
    });
    const report = await createApplicationReadinessReporter(
      createDependencies(production),
    ).report();

    expect(production.requireRedis).toBe(false);
    expect(report.components.redis).toMatchObject({
      code: "REDIS_UNINITIALIZED",
      status: "failed",
    });
  });

  it("does not treat another word segmenter as the official spaCy service", async () => {
    Reflect.set(globalThis, "inited", true);
    const dependencies = createDependencies();
    dependencies.spaCyServices = () => [
      {
        id: "intl-segmenter",
        pluginId: "basic-tokenizer",
        service: {
          getSupportedLanguages: async () => ["en"],
          segment: async () => ({ sentences: [], tokens: [] }),
        },
      },
    ];

    const report =
      await createApplicationReadinessReporter(dependencies).report();

    expect(report.components.spacy).toMatchObject({
      code: "SPACY_NOT_CONFIGURED",
      status: "failed",
    });
  });

  it("requires the selected official spaCy segmenter to tokenize a stable probe", async () => {
    Reflect.set(globalThis, "inited", true);
    const dependencies = createDependencies();
    const segment = vi.fn(async () => ({ sentences: [], tokens: [] }));
    dependencies.spaCyServices = () => [
      {
        id: "spacy-word-segmenter",
        pluginId: "spacy-segmenter",
        service: { getSupportedLanguages: async () => ["en"], segment },
      },
    ];

    await expect(
      createApplicationReadinessReporter(dependencies).report(),
    ).resolves.toMatchObject({
      components: { spacy: { code: "SPACY_UNAVAILABLE", status: "failed" } },
      status: "not-ready",
    });
    expect(segment).toHaveBeenCalledWith({
      languageId: "en",
      signal: expect.any(AbortSignal),
      text: "CAT readiness segment probe.",
    });
  });

  it("attests the instantiated backend kind instead of accepting the profile declaration", async () => {
    Reflect.set(globalThis, "inited", true);
    const dependencies = createDependencies();
    dependencies.backends.cacheStore = Object.create({
      constructor: { name: "RedisCacheStore" },
    });

    await expect(
      createApplicationReadinessReporter(dependencies).report(),
    ).resolves.toMatchObject({
      components: {
        cache: { code: "CACHE_BACKEND_MISMATCH", status: "failed" },
      },
      runtime: { cacheBackend: "redis" },
      status: "not-ready",
    });
  });
});
