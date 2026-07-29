import type { GlobalContextServer } from "vike/types";

import { initializeApp } from "#/server/initialize.ts";
import { getRuntimeCapabilities } from "#/server/runtime-capabilities.ts";

// Production initializes from +server.ts before accepting traffic, while Vite
// development creates its rendering context lazily. The initializer is
// single-flight, so awaiting it here makes both modes expose the same globals.
export const onCreateGlobalContext = async (ctx: GlobalContextServer) => {
  await initializeApp();
  const runtime = getRuntimeCapabilities();
  Object.defineProperty(ctx, "drizzleDB", {
    get: () => runtime.drizzleDB,
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(ctx, "redis", {
    get: () => runtime.redis,
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(ctx, "pluginManager", {
    get: () => runtime.pluginManager,
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(ctx, "name", {
    get: () => runtime.name,
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(ctx, "baseURL", {
    get: () => runtime.baseURL,
    enumerable: true,
    configurable: true,
  });
};
