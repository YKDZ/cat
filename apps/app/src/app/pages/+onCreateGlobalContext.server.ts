import type { GlobalContextServer } from "vike/types";

// setGlobalContext_prodBuildEntry fires at module init (before initializeApp completes).
// We use getters so ctx.globalContext.* always reads the live globalThis.* value,
// which is guaranteed to be set by the time any HTTP request arrives
// (requests only arrive after startServer(), which runs after initializeApp()).
export const onCreateGlobalContext = (ctx: GlobalContextServer) => {
  Object.defineProperty(ctx, "drizzleDB", {
    get: () => globalThis.drizzleDB,
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(ctx, "redis", {
    get: () => globalThis.redis,
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(ctx, "pluginManager", {
    get: () => globalThis.pluginManager,
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(ctx, "name", {
    get: () => globalThis.serverName ?? "CAT",
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(ctx, "baseURL", {
    get: () => globalThis.serverBaseURL ?? "http://localhost:3000/",
    enumerable: true,
    configurable: true,
  });
};
