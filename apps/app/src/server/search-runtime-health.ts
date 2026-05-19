import type {
  DatabaseRuntimeSummary,
  DrizzleClient,
  RuntimeFeature,
  RuntimeProfile,
  SearchRuntimeLevel,
} from "@cat/domain";

import { sql } from "@cat/db";

const levelRank: Record<SearchRuntimeLevel, number> = {
  "basic-db-runtime": 0,
  "partial-search-runtime": 1,
  "full-search-runtime": 2,
};

type SearchRuntimeDb = Pick<DrizzleClient, "execute">;

const classifySearchLevel = (
  extensions: DatabaseRuntimeSummary["extensions"],
  textSearchConfigs: DatabaseRuntimeSummary["textSearchConfigs"],
  functions: DatabaseRuntimeSummary["functions"],
): SearchRuntimeLevel => {
  if (
    extensions.vector &&
    extensions.pg_trgm &&
    extensions.rum &&
    extensions.zhparser &&
    textSearchConfigs.cat_zh_hans &&
    functions.rum_ts_score
  ) {
    return "full-search-runtime";
  }

  if (extensions.vector || extensions.pg_trgm) {
    return "partial-search-runtime";
  }

  return "basic-db-runtime";
};

/**
 * @zh 探测当前数据库可提供的搜索运行时能力摘要。
 * @en Detect the current database search runtime capability summary.
 *
 * @param db - {@zh 用于执行探测查询的数据库句柄} {@en Database handle used to execute capability probes}
 * @returns - {@zh 数据库运行时能力摘要} {@en Database runtime capability summary}
 */
export const detectSearchRuntimeHealth = async (
  db: SearchRuntimeDb,
): Promise<DatabaseRuntimeSummary> => {
  const extensionRows = await db.execute<{ extname: string }>(sql`
    SELECT extname FROM pg_extension WHERE extname IN ('vector', 'pg_trgm', 'rum', 'zhparser')
  `);
  const installed = new Set(extensionRows.rows.map((row) => row.extname));
  const extensions: DatabaseRuntimeSummary["extensions"] = {
    vector: installed.has("vector"),
    pg_trgm: installed.has("pg_trgm"),
    rum: installed.has("rum"),
    zhparser: installed.has("zhparser"),
  };

  const configRows = await db.execute<{ cfgname: string }>(sql`
    SELECT cfgname FROM pg_ts_config WHERE cfgname = 'cat_zh_hans'
  `);
  const functionRows = await db.execute<{ proname: string }>(sql`
    SELECT proname FROM pg_proc WHERE proname = 'rum_ts_score' LIMIT 1
  `);

  const textSearchConfigs = { cat_zh_hans: configRows.rows.length > 0 };
  const functions = { rum_ts_score: functionRows.rows.length > 0 };
  const searchLevel = classifySearchLevel(
    extensions,
    textSearchConfigs,
    functions,
  );

  const disabledFeatures: RuntimeFeature[] = [];
  if (!extensions.vector) {
    disabledFeatures.push("pgvector");
  }
  if (!extensions.rum || !functions.rum_ts_score) {
    disabledFeatures.push("rum-index-ranking");
  }
  if (!extensions.zhparser || !textSearchConfigs.cat_zh_hans) {
    disabledFeatures.push("zhparser-full-text");
  }
  if (searchLevel !== "full-search-runtime") {
    disabledFeatures.push("bm25-memory-recall");
  }

  return {
    backend: "postgres-server",
    searchLevel,
    extensions,
    textSearchConfigs,
    functions,
    disabledFeatures,
    warnings:
      searchLevel === "full-search-runtime"
        ? []
        : [`database search capability degraded to ${searchLevel}`],
  };
};

type SearchRuntimeRequirement = Pick<RuntimeProfile, "requiredSearchLevel">;

/**
 * @zh 断言当前数据库满足运行时配置档要求的最低搜索能力。
 * @en Assert that the current database satisfies the minimum required search capability.
 *
 * @param db - {@zh 用于执行探测查询的数据库句柄} {@en Database handle used to execute capability probes}
 * @param profile - {@zh 可选的运行时要求摘要} {@en Optional runtime requirement summary}
 * @returns - {@zh 数据库运行时能力摘要} {@en Database runtime capability summary}
 */
export const assertSearchRuntimeHealth = async (
  db: SearchRuntimeDb,
  profile?: SearchRuntimeRequirement,
): Promise<DatabaseRuntimeSummary> => {
  const summary = await detectSearchRuntimeHealth(db);
  const required = profile?.requiredSearchLevel ?? "full-search-runtime";

  if (levelRank[summary.searchLevel] < levelRank[required]) {
    throw new Error(
      `Search runtime ${summary.searchLevel} does not satisfy required ${required}. ` +
        `Missing/disabled features: ${summary.disabledFeatures.join(", ") || "none"}`,
    );
  }

  return summary;
};
