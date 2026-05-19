import type {
  RuntimeBackend,
  RuntimeProfile,
  RuntimeProfileName,
  SearchRuntimeLevel,
} from "./types.ts";

const backendPolicy = (backend: RuntimeBackend) => ({
  backend,
  persistent: backend !== "memory",
  sharedAcrossProcesses: backend !== "memory",
});

const parseProfileName = (env: NodeJS.ProcessEnv): RuntimeProfileName => {
  const explicit = env.CAT_RUNTIME_PROFILE;
  if (
    explicit === "lite" ||
    explicit === "standard" ||
    explicit === "production"
  ) {
    return explicit;
  }

  return env.NODE_ENV === "production" ? "production" : "lite";
};

const parseBackend = (
  value: string | undefined,
  fallback: RuntimeBackend,
): RuntimeBackend => {
  if (value === "memory" || value === "postgres" || value === "redis") {
    return value;
  }

  return fallback;
};

const parseSearchRequirement = (
  value: string | undefined,
  fallback: SearchRuntimeLevel,
): SearchRuntimeLevel => {
  if (
    value === "full-search-runtime" ||
    value === "partial-search-runtime" ||
    value === "basic-db-runtime"
  ) {
    return value;
  }

  return fallback;
};

const assertSafeProductionBackends = (
  name: RuntimeProfileName,
  cache: RuntimeBackend,
  session: RuntimeBackend,
  queue: RuntimeBackend,
): void => {
  if (name !== "production") return;

  const memoryBackends = [cache, session, queue].filter(
    (backend) => backend === "memory",
  );
  if (memoryBackends.length === 0) return;

  throw new Error(
    "CAT production profile must not use memory cache/session/queue backends. " +
      "Set CAT_CACHE_BACKEND, CAT_SESSION_BACKEND and CAT_QUEUE_BACKEND to redis or postgres.",
  );
};

/**
 * @zh 从环境变量解析 CAT 运行时配置档。
 * @en Resolve the CAT runtime profile from environment variables.
 *
 * @param env - {@zh 用于解析的环境变量对象} {@en Environment variables to resolve from}
 * @returns - {@zh 解析后的运行时配置档} {@en The resolved runtime profile}
 */
export const resolveRuntimeProfile = (
  env: NodeJS.ProcessEnv = process.env,
): RuntimeProfile => {
  const name = parseProfileName(env);
  const defaults: Record<RuntimeProfileName, RuntimeBackend> = {
    lite: "memory",
    standard: "postgres",
    production: "redis",
  };

  const cache = parseBackend(env.CAT_CACHE_BACKEND, defaults[name]);
  const session = parseBackend(env.CAT_SESSION_BACKEND, defaults[name]);
  const queue = parseBackend(env.CAT_QUEUE_BACKEND, defaults[name]);
  const requiredSearchLevel = parseSearchRequirement(
    env.CAT_SEARCH_REQUIREMENT,
    name === "production" ? "full-search-runtime" : "basic-db-runtime",
  );

  assertSafeProductionBackends(name, cache, session, queue);

  const warnings: string[] = [];
  if ([cache, session, queue].includes("memory")) {
    warnings.push(
      "memory backend is single-process and non-persistent; do not use it for multi-instance deployments",
    );
  }

  return {
    name,
    cache: backendPolicy(cache),
    session: backendPolicy(session),
    queue: backendPolicy(queue),
    allowNonPersistentBackends: name === "lite",
    requireRedis: cache === "redis" || session === "redis" || queue === "redis",
    requiredSearchLevel,
    externalServicesOptional: true,
    warnings,
  };
};
