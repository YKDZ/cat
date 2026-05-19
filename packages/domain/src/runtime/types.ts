import * as z from "zod";

/**
 * @zh 运行时配置档名称的校验 schema。
 * @en Zod schema for runtime profile names.
 */
export const RuntimeProfileNameSchema = z.enum([
  "lite",
  "standard",
  "production",
]);

/**
 * @zh 运行时配置档名称。
 * @en Runtime profile name.
 */
export type RuntimeProfileName = z.infer<typeof RuntimeProfileNameSchema>;

/**
 * @zh 运行时后端类型的校验 schema。
 * @en Zod schema for runtime backend kinds.
 */
export const RuntimeBackendSchema = z.enum(["memory", "postgres", "redis"]);

/**
 * @zh 运行时后端类型。
 * @en Runtime backend kind.
 */
export type RuntimeBackend = z.infer<typeof RuntimeBackendSchema>;

/**
 * @zh 搜索运行时能力等级的校验 schema。
 * @en Zod schema for search runtime capability levels.
 */
export const SearchRuntimeLevelSchema = z.enum([
  "full-search-runtime",
  "partial-search-runtime",
  "basic-db-runtime",
]);

/**
 * @zh 搜索运行时能力等级。
 * @en Search runtime capability level.
 */
export type SearchRuntimeLevel = z.infer<typeof SearchRuntimeLevelSchema>;

/**
 * @zh 运行时能力开关名称的校验 schema。
 * @en Zod schema for runtime feature flags.
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
 * @zh 运行时能力开关名称。
 * @en Runtime feature flag name.
 */
export type RuntimeFeature = z.infer<typeof RuntimeFeatureSchema>;

/**
 * @zh 单个运行时存储策略的摘要。
 * @en Summary of a single runtime storage policy.
 */
export type RuntimeStorePolicy = {
  /**
   * @zh 存储后端类型。
   * @en Storage backend kind.
   */
  backend: RuntimeBackend;
  /**
   * @zh 该后端是否持久化数据。
   * @en Whether this backend persists data.
   */
  persistent: boolean;
  /**
   * @zh 该后端是否可跨进程共享。
   * @en Whether this backend is shared across processes.
   */
  sharedAcrossProcesses: boolean;
};

/**
 * @zh 解析后的运行时配置档。
 * @en Resolved runtime profile configuration.
 */
export type RuntimeProfile = {
  /**
   * @zh 配置档名称。
   * @en Profile name.
   */
  name: RuntimeProfileName;
  /**
   * @zh 缓存后端策略。
   * @en Cache backend policy.
   */
  cache: RuntimeStorePolicy;
  /**
   * @zh 会话后端策略。
   * @en Session backend policy.
   */
  session: RuntimeStorePolicy;
  /**
   * @zh 队列后端策略。
   * @en Queue backend policy.
   */
  queue: RuntimeStorePolicy;
  /**
   * @zh 是否允许非持久化后端。
   * @en Whether non-persistent backends are allowed.
   */
  allowNonPersistentBackends: boolean;
  /**
   * @zh 当前配置是否要求 Redis 可用。
   * @en Whether the current profile requires Redis.
   */
  requireRedis: boolean;
  /**
   * @zh 最低要求的搜索能力等级。
   * @en Minimum required search capability level.
   */
  requiredSearchLevel: SearchRuntimeLevel;
  /**
   * @zh 外部服务是否默认允许注册但可按可用性降级。
   * @en Whether external services may register by default and degrade by availability.
   */
  externalServicesOptional: boolean;
  /**
   * @zh 运行时警告信息。
   * @en Runtime warning messages.
   */
  warnings: string[];
};

/**
 * @zh 数据库运行时能力摘要。
 * @en Summary of database runtime capabilities.
 */
export type DatabaseRuntimeSummary = {
  /**
   * @zh 当前数据库后端类型。
   * @en Current database backend kind.
   */
  backend: "postgres-server" | "embedded-postgres-candidate";
  /**
   * @zh 判定出的搜索能力等级。
   * @en Detected search capability level.
   */
  searchLevel: SearchRuntimeLevel;
  /**
   * @zh 已安装扩展的可用性映射。
   * @en Availability map of required extensions.
   */
  extensions: Record<"vector" | "pg_trgm" | "rum" | "zhparser", boolean>;
  /**
   * @zh 文本搜索配置可用性映射。
   * @en Availability map of text search configurations.
   */
  textSearchConfigs: Record<"cat_zh_hans", boolean>;
  /**
   * @zh 运行时依赖函数可用性映射。
   * @en Availability map of runtime-dependent SQL functions.
   */
  functions: Record<"rum_ts_score", boolean>;
  /**
   * @zh 当前被禁用的功能列表。
   * @en List of features disabled by current database capabilities.
   */
  disabledFeatures: RuntimeFeature[];
  /**
   * @zh 数据库能力警告信息。
   * @en Database capability warning messages.
   */
  warnings: string[];
};

/**
 * @zh 进程内共享的运行时状态快照。
 * @en Process-wide shared runtime state snapshot.
 */
export type RuntimeState = {
  /**
   * @zh 当前解析后的运行时配置档。
   * @en Currently resolved runtime profile.
   */
  profile: RuntimeProfile;
  /**
   * @zh 当前数据库能力摘要。
   * @en Current database capability summary.
   */
  database: DatabaseRuntimeSummary;
  /**
   * @zh 运行时状态初始化时间。
   * @en Timestamp when runtime state was initialized.
   */
  initializedAt: string;
};
