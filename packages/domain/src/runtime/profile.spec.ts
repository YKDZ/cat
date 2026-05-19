import { describe, expect, it } from "vitest";

import { resolveRuntimeProfile } from "./profile.ts";

describe("resolveRuntimeProfile", () => {
  it("defaults to lite memory backends outside production", () => {
    const profile = resolveRuntimeProfile({ NODE_ENV: "test" });

    expect(profile.name).toBe("lite");
    expect(profile.cache.backend).toBe("memory");
    expect(profile.session.backend).toBe("memory");
    expect(profile.queue.backend).toBe("memory");
    expect(profile.requiredSearchLevel).toBe("basic-db-runtime");
  });

  it("defaults to production redis backends in production", () => {
    const profile = resolveRuntimeProfile({ NODE_ENV: "production" });

    expect(profile.name).toBe("production");
    expect(profile.cache.backend).toBe("redis");
    expect(profile.session.backend).toBe("redis");
    expect(profile.queue.backend).toBe("redis");
    expect(profile.requireRedis).toBe(true);
    expect(profile.requiredSearchLevel).toBe("full-search-runtime");
  });

  it("uses postgres defaults for the standard profile", () => {
    const profile = resolveRuntimeProfile({ CAT_RUNTIME_PROFILE: "standard" });

    expect(profile.name).toBe("standard");
    expect(profile.cache.backend).toBe("postgres");
    expect(profile.session.backend).toBe("postgres");
    expect(profile.queue.backend).toBe("postgres");
  });

  it("throws when production overrides any backend to memory", () => {
    expect(() =>
      resolveRuntimeProfile({
        CAT_RUNTIME_PROFILE: "production",
        CAT_CACHE_BACKEND: "memory",
      }),
    ).toThrow(/must not use memory cache\/session\/queue backends/i);
  });

  it("lets explicit backend env vars override profile defaults", () => {
    const profile = resolveRuntimeProfile({
      CAT_RUNTIME_PROFILE: "lite",
      CAT_CACHE_BACKEND: "postgres",
      CAT_SESSION_BACKEND: "redis",
      CAT_QUEUE_BACKEND: "postgres",
      CAT_SEARCH_REQUIREMENT: "partial-search-runtime",
    });

    expect(profile.cache.backend).toBe("postgres");
    expect(profile.session.backend).toBe("redis");
    expect(profile.queue.backend).toBe("postgres");
    expect(profile.requireRedis).toBe(true);
    expect(profile.requiredSearchLevel).toBe("partial-search-runtime");
  });

  it.each(["lite", "standard", "production"] as const)(
    "keeps external services optional for %s",
    (profileName) => {
      const profile = resolveRuntimeProfile({
        CAT_RUNTIME_PROFILE: profileName,
      });

      expect(profile.externalServicesOptional).toBe(true);
    },
  );
});
