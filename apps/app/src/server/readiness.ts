import {
  createReadinessReporter,
  ReadinessProbeFailure,
  type ReadinessReporter,
} from "@cat/app-api/readiness";
import type { RedisConnection } from "@cat/db";
import type {
  DatabaseRuntimeSummary,
  RuntimeProfile,
  RuntimeState,
} from "@cat/domain";
import type { NlpWordSegmenter } from "@cat/plugin-core";

type ApplicationReadinessDependencies = {
  backends: {
    cacheStore: unknown;
    sessionStore: unknown;
    vectorizationQueue: unknown;
  };
  database: { ping: () => Promise<void> };
  getRuntimeState: () => RuntimeState | undefined;
  profile: RuntimeProfile;
  redis: RedisConnection | undefined;
  detectSearchRuntime: () => Promise<DatabaseRuntimeSummary>;
  spaCyServices: () => Array<{
    id: string;
    pluginId: string;
    service: Pick<NlpWordSegmenter, "getSupportedLanguages" | "segment">;
  }>;
  storageServices: () => Array<{ ping: () => Promise<void> }>;
};

const requireInitialized: <T>(
  value: T,
  code: string,
) => asserts value is NonNullable<T> = (value, code) => {
  if (value === undefined || value === null) {
    throw new ReadinessProbeFailure(code);
  }
};

const backendKind = (
  backend: unknown,
): "memory" | "postgres" | "redis" | "unknown" => {
  const name =
    typeof backend === "object" && backend !== null
      ? Object.getPrototypeOf(backend)?.constructor?.name
      : undefined;
  if (typeof name !== "string") return "unknown";
  if (name.startsWith("Memory") || name === "InMemoryTaskQueue")
    return "memory";
  if (name.startsWith("Postgres")) return "postgres";
  if (name.startsWith("Redis")) return "redis";
  return "unknown";
};

const requireBackendKind = (
  backend: unknown,
  expected: string,
  component: string,
): void => {
  requireInitialized(backend, `${component.toUpperCase()}_UNINITIALIZED`);
  if (backendKind(backend) !== expected) {
    throw new ReadinessProbeFailure(
      `${component.toUpperCase()}_BACKEND_MISMATCH`,
    );
  }
};

const requireAvailableStorage = async (
  getServices: () => Array<{ ping: () => Promise<void> }>,
): Promise<void> => {
  const services = getServices();
  if (services.length === 0) {
    throw new ReadinessProbeFailure("STORAGE_NOT_CONFIGURED");
  }

  try {
    await Promise.all(
      services.map(async (service) => {
        await service.ping();
      }),
    );
  } catch {
    throw new ReadinessProbeFailure("STORAGE_UNAVAILABLE");
  }
};

const requireAvailableSpacy = async (
  getServices: () => Array<{
    id: string;
    pluginId: string;
    service: Pick<NlpWordSegmenter, "getSupportedLanguages" | "segment">;
  }>,
  signal: AbortSignal,
): Promise<void> => {
  const service = getServices().find(
    ({ id, pluginId }) =>
      pluginId === "spacy-segmenter" && id === "spacy-word-segmenter",
  );
  if (!service) {
    throw new ReadinessProbeFailure("SPACY_NOT_CONFIGURED");
  }

  try {
    const languages = await service.service.getSupportedLanguages(signal);
    const languageId = languages[0];
    if (languageId === undefined) {
      throw new Error("No supported spaCy languages");
    }
    const result = await service.service.segment({
      languageId,
      signal,
      text: "CAT readiness segment probe.",
    });
    if (result.tokens.length === 0) {
      throw new Error("spaCy did not tokenize the readiness probe");
    }
  } catch {
    throw new ReadinessProbeFailure("SPACY_UNAVAILABLE");
  }
};

/**
 * Build the application-specific readiness aggregate after runtime bootstrap
 * has created its database, backend, storage and NLP service dependencies.
 */
export const createApplicationReadinessReporter = (
  dependencies: ApplicationReadinessDependencies,
): ReadinessReporter => {
  const probes = [
    {
      cost: "cheap" as const,
      id: "bootstrap",
      required: true,
      run: async (): Promise<void> => {
        if (!globalThis.inited) {
          throw new ReadinessProbeFailure("BOOTSTRAP_PENDING");
        }
      },
    },
    {
      cost: "cheap" as const,
      id: "runtime",
      required: true,
      run: async (): Promise<void> => {
        const state = dependencies.getRuntimeState();
        requireInitialized(state, "RUNTIME_UNINITIALIZED");
        if (state.profile.name !== dependencies.profile.name) {
          throw new ReadinessProbeFailure("RUNTIME_PROFILE_MISMATCH");
        }
      },
    },
    {
      cost: "cheap" as const,
      id: "postgres",
      required: true,
      run: async (): Promise<void> => {
        try {
          await dependencies.database.ping();
        } catch {
          throw new ReadinessProbeFailure("DATABASE_UNAVAILABLE");
        }
      },
    },
    {
      cost: "expensive" as const,
      id: "search",
      required: true,
      run: async (): Promise<void> => {
        try {
          const database = await dependencies.detectSearchRuntime();
          if (database.searchLevel !== "full-search-runtime") {
            throw new ReadinessProbeFailure("DATABASE_SEARCH_INSUFFICIENT");
          }
        } catch (error) {
          if (error instanceof ReadinessProbeFailure) throw error;
          throw new ReadinessProbeFailure("DATABASE_SEARCH_UNAVAILABLE");
        }
      },
    },
    {
      cost: "cheap" as const,
      id: "cache",
      required: true,
      run: async (): Promise<void> => {
        requireBackendKind(
          dependencies.backends.cacheStore,
          dependencies.profile.cache.backend,
          "cache",
        );
      },
    },
    {
      cost: "cheap" as const,
      id: "session",
      required: true,
      run: async (): Promise<void> => {
        requireBackendKind(
          dependencies.backends.sessionStore,
          dependencies.profile.session.backend,
          "session",
        );
      },
    },
    {
      cost: "cheap" as const,
      id: "queue",
      required: true,
      run: async (): Promise<void> => {
        requireBackendKind(
          dependencies.backends.vectorizationQueue,
          dependencies.profile.queue.backend,
          "queue",
        );
      },
    },
    {
      cost: "expensive" as const,
      id: "storage",
      required: true,
      run: async (): Promise<void> =>
        requireAvailableStorage(dependencies.storageServices),
    },
    {
      cost: "expensive" as const,
      id: "spacy",
      required: true,
      run: async (signal: AbortSignal): Promise<void> =>
        requireAvailableSpacy(dependencies.spaCyServices, signal),
    },
    ...(dependencies.profile.name === "production"
      ? [
          {
            cost: "cheap" as const,
            id: "redis",
            required: true,
            run: async (): Promise<void> => {
              requireInitialized(dependencies.redis, "REDIS_UNINITIALIZED");
              try {
                await dependencies.redis.ping();
              } catch {
                throw new ReadinessProbeFailure("REDIS_UNAVAILABLE");
              }
            },
          },
        ]
      : []),
  ];

  return createReadinessReporter({
    profile: dependencies.profile.name,
    probes,
    runtime: {
      cacheBackend: backendKind(dependencies.backends.cacheStore),
      queueBackend: backendKind(dependencies.backends.vectorizationQueue),
      requiredSearchLevel: dependencies.profile.requiredSearchLevel,
      sessionBackend: backendKind(dependencies.backends.sessionStore),
    },
  });
};
