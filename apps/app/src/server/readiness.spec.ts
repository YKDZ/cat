import { InMemoryTaskQueue } from "@cat/core";
import {
  MemoryCacheStore,
  MemorySessionStore,
  resolveRuntimeProfile,
  type RuntimeState,
} from "@cat/domain";
import { LanguageAnalysisReadinessError } from "@cat/operations";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApplicationReadinessReporter } from "./readiness.ts";

const profile = resolveRuntimeProfile({ CAT_RUNTIME_PROFILE: "lite" });
const runtimeState: RuntimeState = {
  database: {
    requirements: [
      { id: "POSTGRESQL_CORE", status: "SATISFIED" },
      { id: "POSTGRESQL_TRIGRAM_MATCHING", status: "SATISFIED" },
      { id: "POSTGRESQL_VECTOR_STORAGE", status: "SATISFIED" },
    ],
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
  assessDatabaseRequirements: async (_signal: AbortSignal) =>
    runtimeState.database,
  getRuntimeState: () => ({ ...runtimeState, profile: profileOverride }),
  profile: profileOverride,
  redis: undefined,
  assessLanguageAnalysis: vi.fn(async () => {}),
  storageServices: () => [{ ping: async () => {} }],
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "inited");
});

describe("application readiness", () => {
  it("requires initialized Lite memory backends, storage, Language Analysis, and database requirements without Redis", async () => {
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
        "language-analysis": expect.objectContaining({ status: "ready" }),
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

  it("accepts a live assessment from a selected non-spaCy Language Analyzer", async () => {
    Reflect.set(globalThis, "inited", true);
    const dependencies = createDependencies();

    const report =
      await createApplicationReadinessReporter(dependencies).report();

    expect(dependencies.assessLanguageAnalysis).toHaveBeenCalledWith(
      expect.any(AbortSignal),
    );
    expect(report.components["language-analysis"]).toMatchObject({
      code: "OK",
      status: "ready",
    });
  });

  it("surfaces invalid runtime attestation as a typed readiness blocker", async () => {
    Reflect.set(globalThis, "inited", true);
    const dependencies = createDependencies();
    dependencies.assessLanguageAnalysis = vi.fn(async () => {
      throw new LanguageAnalysisReadinessError("INVALID_ATTESTATION");
    });

    await expect(
      createApplicationReadinessReporter(dependencies).report(),
    ).resolves.toMatchObject({
      components: {
        "language-analysis": {
          code: "LANGUAGE_ANALYSIS_INVALID_ATTESTATION",
          status: "failed",
        },
      },
      status: "not-ready",
    });
  });

  it("recovers after the expensive probe cache expires without restarting", async () => {
    vi.useFakeTimers();
    Reflect.set(globalThis, "inited", true);
    const dependencies = createDependencies();
    let available = false;
    dependencies.assessLanguageAnalysis = vi.fn(async () => {
      if (!available) throw new LanguageAnalysisReadinessError("UNAVAILABLE");
    });
    const reporter = createApplicationReadinessReporter(dependencies);

    await expect(reporter.report()).resolves.toMatchObject({
      status: "not-ready",
    });
    available = true;
    await expect(reporter.report()).resolves.toMatchObject({
      status: "not-ready",
    });
    await vi.advanceTimersByTimeAsync(1_001);
    await expect(reporter.report()).resolves.toMatchObject({ status: "ready" });
    vi.useRealTimers();
  });

  it("reports an exact database requirement blocker", async () => {
    Reflect.set(globalThis, "inited", true);
    const dependencies = createDependencies();
    dependencies.assessDatabaseRequirements = async () => ({
      requirements: [
        { id: "POSTGRESQL_CORE", status: "SATISFIED" },
        {
          blocker: { reason: "EXTENSION_MISSING" },
          id: "POSTGRESQL_TRIGRAM_MATCHING",
          status: "BLOCKED",
        },
        { id: "POSTGRESQL_VECTOR_STORAGE", status: "SATISFIED" },
      ],
    });

    await expect(
      createApplicationReadinessReporter(dependencies).report(),
    ).resolves.toMatchObject({
      components: {
        "database-requirements": {
          code: "DATABASE_POSTGRESQL_TRIGRAM_MATCHING_BLOCKED",
          status: "failed",
        },
      },
      status: "not-ready",
    });
  });

  it("rejects malformed database assessments instead of treating them as ready", async () => {
    Reflect.set(globalThis, "inited", true);
    const dependencies = createDependencies();
    Reflect.set(dependencies, "assessDatabaseRequirements", async () => ({
      requirements: [
        { id: "POSTGRESQL_CORE", status: "SATISFIED" },
        { id: "POSTGRESQL_CORE", status: "SATISFIED" },
        { id: "POSTGRESQL_VECTOR_STORAGE", status: "SATISFIED" },
      ],
    }));

    await expect(
      createApplicationReadinessReporter(dependencies).report(),
    ).resolves.toMatchObject({
      components: {
        "database-requirements": {
          code: "DATABASE_REQUIREMENTS_UNAVAILABLE",
          status: "failed",
        },
      },
      status: "not-ready",
    });
  });

  it("aborts a pending database assessment and retries it after the cache TTL", async () => {
    vi.useFakeTimers();
    try {
      Reflect.set(globalThis, "inited", true);
      const dependencies = createDependencies();
      let available = false;
      const assessor = vi.fn(async (signal: AbortSignal) => {
        if (available) return runtimeState.database;
        await new Promise<void>((_, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
        return runtimeState.database;
      });
      dependencies.assessDatabaseRequirements = assessor;
      const reporter = createApplicationReadinessReporter(dependencies);

      const first = reporter.report();
      await vi.advanceTimersByTimeAsync(2_001);
      await expect(first).resolves.toMatchObject({
        components: {
          "database-requirements": { code: "TIMEOUT", status: "failed" },
        },
        status: "not-ready",
      });
      expect(assessor).toHaveBeenCalledOnce();
      expect(assessor.mock.calls[0]?.[0].aborted).toBe(true);

      available = true;
      await vi.advanceTimersByTimeAsync(1_001);
      await expect(reporter.report()).resolves.toMatchObject({
        status: "ready",
      });
      expect(assessor).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
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
