import type { JSONType } from "@cat/shared/schema/json";

/**
 * @zh 变更集条目的核心字段（与 DB changesetEntry 行对应）。
 * @en Core fields of a changeset entry (mirrors the DB changesetEntry row).
 */
export interface ChangesetEntry {
  id: number;
  changesetId: number;
  entityType: string;
  entityId: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  before: JSONType;
  after: JSONType;
  fieldPath: string | null;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED" | "CONFLICT";
  asyncStatus: string | null;
}

/**
 * @zh 异步依赖规范，描述应用变更时需要等待的后台任务。
 * @en Async dependency spec describing background tasks that must complete when applying a changeset entry.
 */
export interface AsyncDependencySpec {
  description: string;
  estimatedDuration: number;
  retryable: boolean;
  maxRetries: number;
  cancellable: boolean;
  completionEvent: string;
}

/**
 * @zh 应用变更的结果。
 * @en Result of applying a changeset entry.
 */
export interface ApplicationResult {
  status: "APPLIED" | "ASYNC_PENDING" | "FAILED";
  asyncTaskId?: string;
  errorMessage?: string;
  retryAfter?: number;
}

/**
 * @zh 异步依赖的就绪状态。
 * @en Readiness status of an async dependency.
 */
export interface DependencyStatus {
  status: "READY" | "PENDING" | "FAILED";
}

/**
 * @zh 变更应用的上下文（项目、会话、agentRun）。
 * @en Context for applying a changeset entry.
 */
export interface ApplicationContext {
  projectId: string;
  sessionId?: string;
  agentRunId?: number;
}

/**
 * @zh 变更应用方法接口，分离同步 CRUD 和异步依赖操作。
 * @en Application method interface, separating synchronous CRUD from async-dependent operations.
 */
export interface ApplicationMethod {
  entityType: string;
  /** null 表示无异步依赖，直接同步应用。 */
  asyncDependencySpec: AsyncDependencySpec | null;

  applyCreate(
    entry: ChangesetEntry,
    ctx: ApplicationContext,
  ): Promise<ApplicationResult>;

  applyUpdate(
    entry: ChangesetEntry,
    ctx: ApplicationContext,
  ): Promise<ApplicationResult>;

  applyDelete(
    entry: ChangesetEntry,
    ctx: ApplicationContext,
  ): Promise<ApplicationResult>;

  applyRollback(
    entry: ChangesetEntry,
    ctx: ApplicationContext,
  ): Promise<ApplicationResult>;

  validateDependencies(entityId: string): Promise<DependencyStatus>;

  compensate(entry: ChangesetEntry, ctx: ApplicationContext): Promise<void>;
}
