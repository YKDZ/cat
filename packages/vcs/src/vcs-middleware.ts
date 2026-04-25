import type { JSONType, SerializableType } from "@cat/shared";

import type { ChangeSetService } from "./changeset-service.ts";
import type { DiffStrategyRegistry } from "./diff-strategy-registry.ts";

/**
 * @zh VCS 操作上下文，用于决定是否产生审计记录。
 * @en VCS operation context — determines whether to generate audit records.
 */
export interface VCSContext {
  /** @zh VCS 模式 @en VCS mode */
  mode: "direct" | "isolation";
  projectId: string;
  sessionId?: string;
  agentRunId?: number;
  /**
   * @zh Direct 模式下的 ChangeSet ID（延迟创建，首次 interceptWrite 时按需分配）。
   * @en Changeset ID for Direct mode (lazy-created on first interceptWrite call).
   */
  currentChangesetId?: number;
  /**
   * @zh Direct 模式下 changeset 的创建者（通常为当前用户 ID）。
   * @en Creator of the Direct mode changeset (typically current user ID).
   */
  createdBy?: string;
  /** @zh Isolation 模式下使用的分支 ID @en Branch ID used in Isolation mode */
  branchId?: number;
  /** @zh Isolation 模式下使用的分支 changeset ID @en Branch changeset ID used in Isolation mode */
  branchChangesetId?: number;
}

/**
 * @zh VCS 感知中间件：在写操作前后记录 ChangeSet 审计轨迹。
 * - **Direct Mode**: 执行写操作后追加 ChangesetEntry（延迟创建 changeset）
 * - **Isolation Mode**: 不执行实际写操作，仅将变更记录到分支 changeset
 * @en VCS-aware middleware: records changeset audit trails around write operations.
 * - **Direct Mode**: appends ChangesetEntry after the write operation (lazy changeset creation)
 * - **Isolation Mode**: does not execute the write, only records the change to the branch changeset
 */
export class VCSMiddleware {
  constructor(
    private readonly changeSetService: ChangeSetService,
    private readonly diffRegistry: DiffStrategyRegistry,
  ) {}

  /**
   * @zh 拦截一个写操作；Direct Mode 下执行写入并将 diff 结果写入 ChangeSet（延迟创建）；Isolation Mode 下仅记录到分支 changeset，不执行实际写入。
   * `before`/`after` 接受 {@link SerializableType}，内部会通过 `JSON.parse(JSON.stringify(...))` 将 `Date` 等
   * 值序列化为 JSON 兼容形式再传入 diff/changeset 逻辑。
   * @en Intercept a write operation; in Direct Mode, execute the write and record the diff to the ChangeSet (lazy creation);
   * in Isolation Mode, only record to the branch changeset without executing the actual write.
   * `before`/`after` accept {@link SerializableType}; internally they are serialized via
   * `JSON.parse(JSON.stringify(...))` to convert `Date` values to ISO strings before diff/changeset logic.
   */
  async interceptWrite<T>(
    ctx: VCSContext,
    entityType: string,
    entityId: string,
    action: "CREATE" | "UPDATE" | "DELETE",
    before: SerializableType,
    after: SerializableType,
    writeFn: () => Promise<T>,
  ): Promise<T> {
    const beforeJSON = toJSONSafe(before);
    const afterJSON = toJSONSafe(after);

    if (ctx.mode === "isolation" && ctx.branchChangesetId !== undefined) {
      // Isolation mode: do NOT execute writeFn — only record the change to branch changeset
      const diffResult = this.diffRegistry.has(entityType)
        ? this.diffRegistry.diff(entityType, beforeJSON, afterJSON)
        : null;

      await this.changeSetService.addEntry(ctx.branchChangesetId, {
        entityType,
        entityId,
        action,
        before: beforeJSON,
        after: afterJSON,
        riskLevel: diffResult?.impactScope === "CASCADING" ? "MEDIUM" : "LOW",
      });

      // Return `after` as the simulated result of the intercepted write.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      return after as T;
    }

    // Direct mode: execute write, then record entry
    const result = await writeFn();

    // Lazy changeset creation: create on first interceptWrite call
    if (ctx.currentChangesetId === undefined) {
      const cs = await this.changeSetService.createChangeSet({
        projectId: ctx.projectId,
        createdBy: ctx.createdBy,
      });
      ctx.currentChangesetId = cs.id;
    }

    const diffResult = this.diffRegistry.has(entityType)
      ? this.diffRegistry.diff(entityType, beforeJSON, afterJSON)
      : null;

    await this.changeSetService.addEntry(ctx.currentChangesetId, {
      entityType,
      entityId,
      action,
      before: beforeJSON,
      after: afterJSON,
      riskLevel: diffResult?.impactScope === "CASCADING" ? "MEDIUM" : "LOW",
    });

    return result;
  }
}

/**
 * @zh 将 {@link SerializableType} 值深度序列化为 {@link JSONType}。
 * `Date` 会被 `JSON.stringify` 转换为 ISO 字符串；其余 JSON 兼容类型保持不变。
 * @en Deep-serialize a {@link SerializableType} value to {@link JSONType}.
 * `Date` values are converted to ISO strings by `JSON.stringify`; other JSON-compatible types are preserved.
 */
function toJSONSafe(value: SerializableType): JSONType {
  // JSON.stringify converts Date → ISO string; JSON.parse restores a plain JSONType tree.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return JSON.parse(JSON.stringify(value)) as JSONType;
}
