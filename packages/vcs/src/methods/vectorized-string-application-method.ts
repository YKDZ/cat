import type { JSONType } from "@cat/shared";

import type {
  ApplicationContext,
  ApplicationMethod,
  ApplicationResult,
  AsyncDependencySpec,
  ChangesetEntry,
  DependencyStatus,
} from "../application-method.ts";
import type { EntityStateFetcher } from "./simple-application-method.ts";

const VECTORIZATION_ASYNC_SPEC: AsyncDependencySpec = {
  description: "TranslatableString vectorization via pgvector",
  estimatedDuration: 5000,
  retryable: true,
  maxRetries: 3,
  cancellable: false,
  completionEvent: "vectorization.completed",
};

/**
 * @zh 带向量化异步依赖的应用方法。适用于 translation、element、term_concept、memory_item。
 * CREATE 操作返回 ASYNC_PENDING（后台向量化任务启动后完成）。
 * Phase 0b 中为存根实现。
 * @en Application method for entities requiring async vectorization.
 * CREATE returns ASYNC_PENDING. Stub implementation for Phase 0b.
 */
export class VectorizedStringApplicationMethod implements ApplicationMethod {
  readonly entityType: string;
  readonly asyncDependencySpec: AsyncDependencySpec = VECTORIZATION_ASYNC_SPEC;
  private fetcher: EntityStateFetcher | null;

  constructor(entityType: string, fetcher?: EntityStateFetcher) {
    this.entityType = entityType;
    this.fetcher = fetcher ?? null;
  }

  async applyCreate(
    _entry: ChangesetEntry,
    _ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    // In a real implementation, this would enqueue a vectorization job and
    // return the task ID. Phase 0b stub returns ASYNC_PENDING.
    return {
      status: "ASYNC_PENDING",
      asyncTaskId: `vect-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
  }

  async applyUpdate(
    _entry: ChangesetEntry,
    _ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    return {
      status: "ASYNC_PENDING",
      asyncTaskId: `vect-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
  }

  async applyDelete(
    _entry: ChangesetEntry,
    _ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    // Deletion is synchronous — vector index entry is removed directly
    return { status: "APPLIED" };
  }

  async applyRollback(
    _entry: ChangesetEntry,
    _ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    return {
      status: "ASYNC_PENDING",
      asyncTaskId: `vect-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
  }

  async validateDependencies(_entityId: string): Promise<DependencyStatus> {
    // In production: check if the vectorization task completed in the queue
    return { status: "READY" };
  }

  async compensate(
    _entry: ChangesetEntry,
    _ctx: ApplicationContext,
  ): Promise<void> {
    // Cancel or clean up any pending vectorization jobs
  }

  async fetchCurrentState(
    entityId: string,
    ctx: ApplicationContext,
  ): Promise<JSONType | null> {
    if (!this.fetcher) return null;
    return this.fetcher.fetchOne(entityId, ctx);
  }

  async fetchCurrentStates(
    entityIds: string[],
    ctx: ApplicationContext,
  ): Promise<Map<string, JSONType>> {
    if (!this.fetcher) return new Map();
    return this.fetcher.fetchMany(entityIds, ctx);
  }

  setFetcher(fetcher: EntityStateFetcher): void {
    this.fetcher = fetcher;
  }
}
