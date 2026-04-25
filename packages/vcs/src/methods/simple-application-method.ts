import type { JSONType } from "@cat/shared";

import type {
  ApplicationContext,
  ApplicationMethod,
  ApplicationResult,
  AsyncDependencySpec,
  ChangesetEntry,
  DependencyStatus,
} from "../application-method.ts";

/**
 * @zh 实体状态查询回调。由注册方提供，用于 rebase before-重写。
 * @en Entity state fetcher callback, provided by the registrar for rebase before-rewrite.
 */
export type EntityStateFetcher = {
  fetchOne: (
    entityId: string,
    ctx: ApplicationContext,
  ) => Promise<JSONType | null>;
  fetchMany: (
    entityIds: string[],
    ctx: ApplicationContext,
  ) => Promise<Map<string, JSONType>>;
};

/**
 * @zh 简单 CRUD 应用方法。适用于无异步依赖的实体（project_settings、project_member、
 * project_attributes、context、comment、comment_reaction、document、document_tree、term）。
 * Phase 0b 中为存根实现——仅记录操作并返回 APPLIED。
 * @en Simple CRUD application method for entities with no async dependencies.
 * Stub implementation for Phase 0b — records the action and returns APPLIED.
 */
export class SimpleApplicationMethod implements ApplicationMethod {
  readonly entityType: string;
  readonly asyncDependencySpec: AsyncDependencySpec | null = null;
  private fetcher: EntityStateFetcher | null;

  constructor(entityType: string, fetcher?: EntityStateFetcher) {
    this.entityType = entityType;
    this.fetcher = fetcher ?? null;
  }

  async applyCreate(
    _entry: ChangesetEntry,
    _ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    return { status: "APPLIED" };
  }

  async applyUpdate(
    _entry: ChangesetEntry,
    _ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    return { status: "APPLIED" };
  }

  async applyDelete(
    _entry: ChangesetEntry,
    _ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    return { status: "APPLIED" };
  }

  async applyRollback(
    _entry: ChangesetEntry,
    _ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    return { status: "APPLIED" };
  }

  async validateDependencies(_entityId: string): Promise<DependencyStatus> {
    return { status: "READY" };
  }

  async compensate(
    _entry: ChangesetEntry,
    _ctx: ApplicationContext,
  ): Promise<void> {
    // No compensation needed for simple CRUD
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

/**
 * @zh 为多个 entityType 批量创建 SimpleApplicationMethod 实例。
 * @en Create SimpleApplicationMethod instances for multiple entityTypes.
 */
export const createSimpleMethods = (
  entityTypes: string[],
): SimpleApplicationMethod[] =>
  entityTypes.map((t) => new SimpleApplicationMethod(t));
