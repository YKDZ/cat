import type { JSONType } from "@cat/shared/schema/json";

import type { ChangeSetService } from "./changeset-service.ts";
import type { DiffStrategyRegistry } from "./diff-strategy-registry.ts";

/**
 * @zh VCS 操作上下文，用于决定是否产生审计记录。
 * @en VCS operation context — determines whether to generate audit records.
 */
export interface VCSContext {
  /** @zh VCS 模式 @en VCS mode */
  mode: "trust" | "audit" | "isolation";
  projectId: string;
  sessionId?: string;
  agentRunId?: number;
  /** @zh 当前活跃的 ChangeSet ID（Audit 模式中使用） @en Active changeset ID for Audit mode */
  currentChangesetId?: number;
  /** @zh Isolation 模式下使用的分支 ID @en Branch ID used in Isolation mode */
  branchId?: number;
  /** @zh Isolation 模式下使用的分支 changeset ID @en Branch changeset ID used in Isolation mode */
  branchChangesetId?: number;
}

/**
 * @zh VCS 感知中间件：在写操作前后记录 ChangeSet 审计轨迹。
 * - **Trust Mode**: 直通，不产生审计记录
 * - **Audit Mode**: 执行写操作后追加 ChangesetEntry
 * - **Isolation Mode**: 不执行实际写操作，仅将变更记录到分支 changeset
 * @en VCS-aware middleware: records changeset audit trails around write operations.
 * - **Trust Mode**: passthrough, no audit records
 * - **Audit Mode**: appends ChangesetEntry after the write operation
 * - **Isolation Mode**: does not execute the write, only records the change to the branch changeset
 */
export class VCSMiddleware {
  constructor(
    private readonly changeSetService: ChangeSetService,
    private readonly diffRegistry: DiffStrategyRegistry,
  ) {}

  /**
   * @zh 拦截一个写操作；Audit Mode 下将 diff 结果写入 ChangeSet；Isolation Mode 下仅记录到分支 changeset，不执行实际写入。
   * @en Intercept a write operation; in Audit Mode, write the diff result to the ChangeSet;
   * in Isolation Mode, only record to the branch changeset without executing the actual write.
   */
  async interceptWrite<T>(
    ctx: VCSContext,
    entityType: string,
    entityId: string,
    action: "CREATE" | "UPDATE" | "DELETE",
    before: unknown,
    after: unknown,
    writeFn: () => Promise<T>,
  ): Promise<T> {
    if (ctx.mode === "isolation" && ctx.branchChangesetId !== undefined) {
      // Isolation mode: do NOT execute writeFn — only record the change to branch changeset
      // Diff registry expects JSONType; domain entities are treated as JSON-compatible here.
      const diffResult = this.diffRegistry.has(entityType)
        ? this.diffRegistry.diff(
            entityType,
            before as JSONType,
            after as JSONType,
          )
        : null;

      await this.changeSetService.addEntry(ctx.branchChangesetId, {
        entityType,
        entityId,
        action,
        before,
        after,
        riskLevel: diffResult?.impactScope === "CASCADING" ? "MEDIUM" : "LOW",
      });

      // Return `after` as the simulated result of the intercepted write.
      return after as T;
    }

    const result = await writeFn();

    if (ctx.mode === "audit" && ctx.currentChangesetId !== undefined) {
      const diffResult = this.diffRegistry.has(entityType)
        ? this.diffRegistry.diff(
            entityType,
            before as JSONType,
            after as JSONType,
          )
        : null;

      await this.changeSetService.addEntry(ctx.currentChangesetId, {
        entityType,
        entityId,
        action,
        before,
        after,
        riskLevel: diffResult?.impactScope === "CASCADING" ? "MEDIUM" : "LOW",
      });
    }

    return result;
  }
}
