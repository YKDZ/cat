import type { DbHandle } from "@cat/domain";
import type { JSONType } from "@cat/shared";

/**
 * Core fields of a changeset entry (mirrors the DB changesetEntry row).
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
 * Async dependency spec describing background tasks that must complete when applying a changeset entry.
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
 * Result of applying a changeset entry.
 */
export interface ApplicationResult {
  status: "APPLIED" | "ASYNC_PENDING" | "FAILED";
  asyncTaskId?: string;
  errorMessage?: string;
  retryAfter?: number;
}

/**
 * Readiness status of an async dependency.
 */
export interface DependencyStatus {
  status: "READY" | "PENDING" | "FAILED";
}

/**
 * Context for applying a changeset entry.
 */
export interface ApplicationContext {
  projectId: string;
  sessionId?: string;
  agentRunId?: number;
  db?: DbHandle;
}

/**
 * Application method interface, separating synchronous CRUD from async-dependent operations.
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

  /**
   * 返回 null 表示实体不存在（已被删除或未创建）。
   * Fetch the current state of an entity from the actual DB table. Used for rebase before-rewrite.
   * Returns null if the entity does not exist (deleted or not yet created).
   */
  fetchCurrentState(
    entityId: string,
    ctx: ApplicationContext,
  ): Promise<JSONType | null>;

  /**
   * 返回 entityId → state 的映射，不存在的实体不包含在映射中。
   * Batch-fetch current states of multiple entities from the actual DB table.
   * Returns a map of entityId → state. Missing entities are omitted from the map.
   */
  fetchCurrentStates(
    entityIds: string[],
    ctx: ApplicationContext,
  ): Promise<Map<string, JSONType>>;
}
