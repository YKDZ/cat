import type {
  ApplicationContext,
  ApplicationMethod,
  ApplicationResult,
  AsyncDependencySpec,
  ChangesetEntry,
  DependencyStatus,
} from "../application-method.ts";

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

  constructor(entityType: string) {
    this.entityType = entityType;
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
}

/**
 * @zh 为多个 entityType 批量创建 SimpleApplicationMethod 实例。
 * @en Create SimpleApplicationMethod instances for multiple entityTypes.
 */
export const createSimpleMethods = (
  entityTypes: string[],
): SimpleApplicationMethod[] =>
  entityTypes.map((t) => new SimpleApplicationMethod(t));
