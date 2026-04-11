import type { JSONType } from "@cat/shared/schema/json";

import type { ChangeSetService } from "./changeset-service.ts";
import type { DiffStrategyRegistry } from "./diff-strategy-registry.ts";

/**
 * @zh VCS 操作上下文，用于决定是否产生审计记录。
 * @en VCS operation context — determines whether to generate audit records.
 */
export interface VCSContext {
  /** @zh VCS 模式 @en VCS mode */
  mode: "trust" | "audit";
  projectId: string;
  sessionId?: string;
  agentRunId?: number;
  /** @zh 当前活跃的 ChangeSet ID（Audit 模式中使用） @en Active changeset ID for Audit mode */
  currentChangesetId?: number;
}

/**
 * @zh VCS 感知中间件：在写操作前后记录 ChangeSet 审计轨迹。
 * - **Trust Mode**: 直通，不产生审计记录
 * - **Audit Mode**: 执行写操作后追加 ChangesetEntry
 * @en VCS-aware middleware: records changeset audit trails around write operations.
 * - **Trust Mode**: passthrough, no audit records
 * - **Audit Mode**: appends ChangesetEntry after the write operation
 */
export class VCSMiddleware {
  constructor(
    private readonly changeSetService: ChangeSetService,
    private readonly diffRegistry: DiffStrategyRegistry,
  ) {}

  /**
   * @zh 拦截一个写操作；Audit Mode 下将 diff 结果写入 ChangeSet。
   * @en Intercept a write operation; in Audit Mode, write the diff result to the ChangeSet.
   */
  async interceptWrite<T>(
    ctx: VCSContext,
    entityType: string,
    entityId: string,
    action: "CREATE" | "UPDATE" | "DELETE",
    before: JSONType,
    after: JSONType,
    writeFn: () => Promise<T>,
  ): Promise<T> {
    const result = await writeFn();

    if (ctx.mode === "audit" && ctx.currentChangesetId !== undefined) {
      const diffResult = this.diffRegistry.has(entityType)
        ? this.diffRegistry.diff(entityType, before, after)
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
