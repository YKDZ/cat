import * as z from "zod";

/**
 * Zod schema for runtime profile names.
 */
export const RuntimeProfileNameSchema = z.enum([
  "lite",
  "standard",
  "production",
]);

/**
 * Runtime profile name.
 */
export type RuntimeProfileName = z.infer<typeof RuntimeProfileNameSchema>;

/**
 * Zod schema for runtime backend kinds.
 */
export const RuntimeBackendSchema = z.enum(["memory", "postgres", "redis"]);

/**
 * Runtime backend kind.
 */
export type RuntimeBackend = z.infer<typeof RuntimeBackendSchema>;

/**
 * Zod schema for search runtime capability levels.
 */
export const SearchRuntimeLevelSchema = z.enum([
  "full-search-runtime",
  "partial-search-runtime",
  "basic-db-runtime",
]);

/**
 * Search runtime capability level.
 */
export type SearchRuntimeLevel = z.infer<typeof SearchRuntimeLevelSchema>;

/**
 * Zod schema for runtime feature flags.
 */
export const RuntimeFeatureSchema = z.enum([
  "redis",
  "bm25-memory-recall",
  "zhparser-full-text",
  "rum-index-ranking",
  "pgvector",
  "external-llm",
  "external-mt",
  "external-nlp",
  "external-rerank",
  "external-vectorizer",
]);

/**
 * Runtime feature flag name.
 */
export type RuntimeFeature = z.infer<typeof RuntimeFeatureSchema>;

/**
 * Summary of a single runtime storage policy.
 */
export type RuntimeStorePolicy = {
  /**
   * Storage backend kind.
   */
  backend: RuntimeBackend;
  /**
   * Whether this backend persists data.
   */
  persistent: boolean;
  /**
   * Whether this backend is shared across processes.
   */
  sharedAcrossProcesses: boolean;
};

/**
 * Resolved runtime profile configuration.
 */
export type RuntimeProfile = {
  /**
   * Profile name.
   */
  name: RuntimeProfileName;
  /**
   * Cache backend policy.
   */
  cache: RuntimeStorePolicy;
  /**
   * Session backend policy.
   */
  session: RuntimeStorePolicy;
  /**
   * Queue backend policy.
   */
  queue: RuntimeStorePolicy;
  /**
   * Whether non-persistent backends are allowed.
   */
  allowNonPersistentBackends: boolean;
  /**
   * Whether the current profile requires Redis.
   */
  requireRedis: boolean;
  /**
   * Minimum required search capability level.
   */
  requiredSearchLevel: SearchRuntimeLevel;
  /**
   * Whether external services may register by default and degrade by availability.
   */
  externalServicesOptional: boolean;
  /**
   * Runtime warning messages.
   */
  warnings: string[];
};

/**
 * Summary of database runtime capabilities.
 */
export type DatabaseRuntimeSummary = {
  /**
   * Current database backend kind.
   */
  backend: "postgres-server" | "embedded-postgres-candidate";
  /**
   * Detected search capability level.
   */
  searchLevel: SearchRuntimeLevel;
  /**
   * Availability map of required extensions.
   */
  extensions: Record<"vector" | "pg_trgm" | "rum" | "zhparser", boolean>;
  /**
   * Availability map of text search configurations.
   */
  textSearchConfigs: Record<"cat_zh_hans", boolean>;
  /**
   * Availability map of runtime-dependent SQL functions.
   */
  functions: Record<"rum_ts_score", boolean>;
  /**
   * List of features disabled by current database capabilities.
   */
  disabledFeatures: RuntimeFeature[];
  /**
   * Database capability warning messages.
   */
  warnings: string[];
};

/**
 * Process-wide shared runtime state snapshot.
 */
export type RuntimeState = {
  /**
   * Currently resolved runtime profile.
   */
  profile: RuntimeProfile;
  /**
   * Current database capability summary.
   */
  database: DatabaseRuntimeSummary;
  /**
   * Timestamp when runtime state was initialized.
   */
  initializedAt: string;
};
