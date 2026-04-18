import type { DbHandle } from "@cat/domain";
import type { ChangesetStatus } from "@cat/shared/schema/enum";
import type { JSONType } from "@cat/shared/schema/json";

import {
  addChangesetEntry,
  applyChangeset,
  createChangeset,
  getChangeset,
  getChangesetEntries,
  listChangesets,
  reviewChangeset,
  reviewChangesetEntry,
  updateChangesetAsyncStatus,
  updateEntryAsyncStatus,
} from "@cat/domain";
import { EntityTypeSchema } from "@cat/shared/schema/enum";

import type { ApplicationMethodRegistry } from "./application-method-registry.ts";
import type { ChangesetEntry } from "./application-method.ts";
import type { DiffStrategyRegistry } from "./diff-strategy-registry.ts";
import type { DiffResult } from "./diff-strategy.ts";

// ─── Local Types ──────────────────────────────────────────────────────────────

/**
 * @zh 变更集摘要（agent 内部使用）。
 * @en Changeset summary for internal agent use.
 */
export interface Changeset {
  id: number;
  externalId: string;
  projectId: string;
  status: string;
  summary: string | null;
  asyncStatus: "ALL_READY" | "HAS_PENDING" | "HAS_FAILED" | null;
  createdAt: Date;
}

// ─── Error Types ─────────────────────────────────────────────────────────────

export class OCCConflictError extends Error {
  constructor(
    public readonly entityType: string,
    public readonly entityId: string,
  ) {
    super(
      `OCC conflict detected for ${entityType}:${entityId} — entity was modified concurrently`,
    );
    this.name = "OCCConflictError";
  }
}

// ─── Param Types ─────────────────────────────────────────────────────────────

export interface CreateChangeSetParams {
  projectId: string;
  agentRunId?: number;
  createdBy?: string;
  summary?: string;
}

export interface AddEntryParams {
  entityType: string;
  entityId: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  before?: JSONType;
  after?: JSONType;
  fieldPath?: string;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH";
}

export interface ChangeSetFilters {
  status?: ChangesetStatus;
  limit?: number;
  offset?: number;
}

// ─── Helper: map DB row → shared Changeset type ────────────────────────────

type DBChangeset = Awaited<ReturnType<typeof getChangeset>>;
type DBChangesetEntry = Awaited<ReturnType<typeof getChangesetEntries>>[number];

const mapEntry = (row: DBChangesetEntry): ChangesetEntry => ({
  id: row.id,
  changesetId: row.changesetId,
  entityType: row.entityType as ChangesetEntry["entityType"],
  entityId: row.entityId,
  action: row.action,
  before: row.before ?? null,
  after: row.after ?? null,
  fieldPath: row.fieldPath ?? null,
  riskLevel: row.riskLevel ?? "LOW",
  reviewStatus: row.reviewStatus ?? "PENDING",
  asyncStatus: (row.asyncStatus as ChangesetEntry["asyncStatus"]) ?? null,
});

const mapChangeset = (row: NonNullable<DBChangeset>): Changeset => ({
  id: row.id,
  externalId: row.externalId ?? "",
  projectId: row.projectId,
  status: row.status,
  summary: row.summary ?? null,
  asyncStatus: row.asyncStatus,
  createdAt: row.createdAt,
});

// ─── ChangeSetService ────────────────────────────────────────────────────────

/**
 * @zh ChangeSet 核心服务：提供 CRUD、状态机转换和 OCC 版本检查。
 * @en Core service for changeset CRUD, state-machine transitions, and OCC version checking.
 */
export class ChangeSetService {
  private readonly ctx: { db: DbHandle };

  constructor(
    db: DbHandle,
    private readonly diffRegistry: DiffStrategyRegistry,
    private readonly appMethodRegistry: ApplicationMethodRegistry,
  ) {
    this.ctx = { db };
  }

  //──────────────────────────────────────────────────────────────────────────
  // Creation
  //──────────────────────────────────────────────────────────────────────────

  async createChangeSet(params: CreateChangeSetParams): Promise<Changeset> {
    const { result } = await createChangeset(this.ctx, {
      projectId: params.projectId,
      agentRunId: params.agentRunId,
      createdBy: params.createdBy,
      summary: params.summary,
    });
    return mapChangeset(result);
  }

  async addEntry(
    changesetId: number,
    params: AddEntryParams,
  ): Promise<ChangesetEntry> {
    // Determine asyncStatus based on entity type
    const method = this.appMethodRegistry.has(params.entityType)
      ? this.appMethodRegistry.get(params.entityType)
      : null;

    const asyncStatus = method?.asyncDependencySpec !== null ? "PENDING" : null;

    const { result } = await addChangesetEntry(this.ctx, {
      changesetId,
      entityType: EntityTypeSchema.parse(params.entityType),
      entityId: params.entityId,
      action: params.action,
      before: params.before,
      after: params.after,
      fieldPath: params.fieldPath,
      riskLevel: params.riskLevel ?? "LOW",
      asyncStatus,
    });
    return mapEntry(result);
  }

  //──────────────────────────────────────────────────────────────────────────
  // Diff
  //──────────────────────────────────────────────────────────────────────────

  diffEntities(
    entityType: string,
    before: JSONType,
    after: JSONType,
  ): DiffResult {
    return this.diffRegistry.diff(entityType, before, after);
  }

  //──────────────────────────────────────────────────────────────────────────
  // Review
  //──────────────────────────────────────────────────────────────────────────

  async reviewEntry(
    entryId: number,
    verdict: "APPROVED" | "REJECTED",
  ): Promise<void> {
    await reviewChangesetEntry(this.ctx, { entryId, verdict });
  }

  async reviewChangeSet(
    changesetId: number,
    verdict: "APPROVED" | "REJECTED",
    reviewedBy?: string,
  ): Promise<void> {
    await reviewChangeset(this.ctx, { changesetId, verdict, reviewedBy });
  }

  //──────────────────────────────────────────────────────────────────────────
  // Apply
  //──────────────────────────────────────────────────────────────────────────

  /**
   * @zh 应用一个 ChangeSet：逐条 entry 调用 ApplicationMethod，最后更新状态为 APPLIED。
   * @en Apply a changeset by invoking the ApplicationMethod for each entry.
   */
  async applyChangeSet(
    changesetId: number,
    ctx: { projectId: string; sessionId?: string; agentRunId?: number },
  ): Promise<void> {
    const entries = await getChangesetEntries(this.ctx, { changesetId });

    await Promise.all(
      entries
        .filter((row) => this.appMethodRegistry.has(row.entityType))
        .map(async (row) => {
          const method = this.appMethodRegistry.get(row.entityType);
          const action = row.action;
          const methodCtx = { ...ctx, db: this.ctx.db };

          let result;
          if (action === "CREATE") {
            result = await method.applyCreate(mapEntry(row), methodCtx);
          } else if (action === "UPDATE") {
            result = await method.applyUpdate(mapEntry(row), methodCtx);
          } else {
            result = await method.applyDelete(mapEntry(row), methodCtx);
          }

          const entryAsyncStatus =
            result.status === "ASYNC_PENDING"
              ? "PENDING"
              : result.status === "APPLIED"
                ? "READY"
                : "FAILED";

          await updateEntryAsyncStatus(this.ctx, {
            entryId: row.id,
            asyncStatus: entryAsyncStatus,
          });
        }),
    );

    await applyChangeset(this.ctx, { changesetId });
  }

  //──────────────────────────────────────────────────────────────────────────
  // Rollback
  //──────────────────────────────────────────────────────────────────────────

  /**
   * @zh 生成反向 ChangeSet（回滚）：对每条 entry 交换 before/after 并反转 action。
   * @en Generate a reverse changeset for rollback by swapping before/after and inverting action.
   */
  async rollbackChangeSet(
    changesetId: number,
    createdBy?: string,
  ): Promise<Changeset> {
    const original = await getChangeset(this.ctx, { changesetId });
    if (!original) throw new Error(`Changeset ${changesetId} not found`);

    const entries = await getChangesetEntries(this.ctx, { changesetId });

    const reverseAction = (action: string): "CREATE" | "UPDATE" | "DELETE" => {
      if (action === "CREATE") return "DELETE";
      if (action === "DELETE") return "CREATE";
      return "UPDATE";
    };

    const { result: reverse } = await createChangeset(this.ctx, {
      projectId: original.projectId,
      createdBy,
      summary: `Rollback of changeset #${changesetId}`,
    });

    await Promise.all(
      entries.map(async (entry) =>
        addChangesetEntry(this.ctx, {
          changesetId: reverse.id,
          entityType: EntityTypeSchema.parse(entry.entityType),
          entityId: entry.entityId,
          action: reverseAction(entry.action),
          before: entry.after,
          after: entry.before,
          fieldPath: entry.fieldPath ?? undefined,
          riskLevel: entry.riskLevel ?? "LOW",
        }),
      ),
    );

    return mapChangeset(reverse);
  }

  //──────────────────────────────────────────────────────────────────────────
  // Read
  //──────────────────────────────────────────────────────────────────────────

  async getChangeSet(changesetId: number): Promise<Changeset> {
    const row = await getChangeset(this.ctx, { changesetId });
    if (!row) throw new Error(`Changeset ${changesetId} not found`);
    return mapChangeset(row);
  }

  async listChangeSets(
    projectId: string,
    filters?: ChangeSetFilters,
  ): Promise<Changeset[]> {
    const rows = await listChangesets(this.ctx, {
      projectId,
      status: filters?.status,
      limit: filters?.limit ?? 20,
      offset: filters?.offset ?? 0,
    });
    return rows.map(mapChangeset);
  }

  //──────────────────────────────────────────────────────────────────────────
  // Async status
  //──────────────────────────────────────────────────────────────────────────

  /**
   * @zh 根据所有 entry 的 asyncStatus 计算 ChangeSet 级别的异步状态。
   * @en Compute the changeset-level asyncStatus from all entry asyncStatuses.
   */
  async computeAsyncStatus(
    changesetId: number,
  ): Promise<"ALL_READY" | "HAS_PENDING" | "HAS_FAILED" | null> {
    const entries = await getChangesetEntries(this.ctx, { changesetId });
    const asyncEntries = entries.filter((e) => e.asyncStatus !== null);
    if (asyncEntries.length === 0) return null;

    if (asyncEntries.some((e) => e.asyncStatus === "FAILED"))
      return "HAS_FAILED";
    if (asyncEntries.some((e) => e.asyncStatus === "PENDING"))
      return "HAS_PENDING";
    return "ALL_READY";
  }

  async syncChangeSetAsyncStatus(changesetId: number): Promise<void> {
    const status = await this.computeAsyncStatus(changesetId);
    await updateChangesetAsyncStatus(this.ctx, {
      changesetId,
      asyncStatus: status,
    });
  }

  //──────────────────────────────────────────────────────────────────────────
  // OCC version check
  //──────────────────────────────────────────────────────────────────────────

  /**
   * @zh OCC 乐观并发控制：检查实体的当前 updatedAt 是否与预期版本匹配。
   * Phase 0b 中为占位实现——实际版本检查需要具体实体查询。
   * @en OCC check: verify the entity's updatedAt matches the expected version.
   * Phase 0b stub — real version check requires entity-specific queries.
   */
  async checkOCCVersion(
    _entityType: string,
    _entityId: string,
    _expectedVersion: Date,
  ): Promise<boolean> {
    // Phase 0b: always returns true (no-op OCC check)
    // Phase 1: query entity updatedAt and compare with expectedVersion
    return true;
  }
}
