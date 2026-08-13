import { beforeEach, describe, expect, it } from "vitest";

import {
  getRuntimeCapabilities,
  publishRuntimeCapabilities,
  resetRuntimeCapabilitiesForTest,
  type RuntimeCapabilities,
} from "./runtime-capabilities.ts";

const createCapabilities = (): RuntimeCapabilities => ({
  baseURL: "http://localhost:3000/",
  cacheStore: {
    delete: async () => undefined,
    get: async () => null,
    has: async () => false,
    set: async () => undefined,
  },
  drizzleDB: {} as never,
  name: "CAT",
  pluginManager: {} as never,
  redis: undefined,
  sessionStore: {
    create: async () => undefined,
    destroy: async () => undefined,
    getAll: async () => null,
    getField: async () => null,
  },
});

describe("runtime capability bridge", () => {
  beforeEach(() => {
    resetRuntimeCapabilitiesForTest();
  });

  it("shares the initialized host identity with SSR consumers", () => {
    const host = createCapabilities();
    publishRuntimeCapabilities(host);

    const healthRuntime = getRuntimeCapabilities();
    const authSsrRuntime = getRuntimeCapabilities();

    expect(authSsrRuntime).toBe(healthRuntime);
    expect(authSsrRuntime.pluginManager).toBe(host.pluginManager);
    expect(authSsrRuntime.drizzleDB).toBe(host.drizzleDB);
    expect(authSsrRuntime.cacheStore).toBe(host.cacheStore);
    expect(authSsrRuntime.sessionStore).toBe(host.sessionStore);
  });

  it("fails closed before host initialization", () => {
    expect(() => getRuntimeCapabilities()).toThrow(
      "CAT runtime capabilities have not been initialized",
    );
  });
});
