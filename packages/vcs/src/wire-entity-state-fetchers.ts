import type { DbHandle } from "@cat/domain";

import type { ApplicationMethodRegistry } from "./application-method-registry.ts";

/**
 * @zh 向 ApplicationMethodRegistry 中的每个 method 注入 EntityStateFetcher。
 * 在服务器启动时调用一次，使 rebase before-重写可以查询实际数据库表。
 * @en Inject EntityStateFetcher into each method in the registry.
 * Called once at server startup so rebase before-rewrite can query actual DB tables.
 */
// oxlint-disable-next-line @typescript-eslint/no-unused-vars
export function wireEntityStateFetchers(
  _registry: ApplicationMethodRegistry,
  _db: DbHandle,
): void {
  // Wire fetchers for each registered entity type
  // Each fetcher uses domain queries (e.g., getTranslationById, getElementById)
  // to read current state from the actual DB table.
  //
  // Implementation: iterate over registry entries, create fetchers using
  // the appropriate domain query for each entityType, and call
  // method.setFetcher(fetcher) or re-register with fetcher.
  //
  // The exact domain queries to use per entityType will be determined
  // during implementation by inspecting available queries in @cat/domain.
}
