import type { JSONType, SerializableType } from "@cat/shared";

import type { ChangeSetService } from "./changeset-service.ts";
import type { DiffStrategyRegistry } from "./diff-strategy-registry.ts";

/**
 * VCS operation context — determines whether to generate audit records.
 */
export interface VCSContext {
  /** VCS mode */
  mode: "direct" | "isolation";
  projectId: string;
  sessionId?: string;
  agentRunId?: number;
  /**
   * Changeset ID for Direct mode (lazy-created on first interceptWrite call).
   */
  currentChangesetId?: number;
  /**
   * Creator of the Direct mode changeset (typically current user ID).
   */
  createdBy?: string;
  /** Branch ID used in Isolation mode */
  branchId?: number;
  /** Branch changeset ID used in Isolation mode */
  branchChangesetId?: number;
}

/**
 * VCS-aware middleware: records changeset audit trails around write operations.
 * - **Direct Mode**: appends ChangesetEntry after the write operation (lazy changeset creation)
 * - **Isolation Mode**: does not execute the write, only records the change to the branch changeset
 */
export class VCSMiddleware {
  constructor(
    private readonly changeSetService: ChangeSetService,
    private readonly diffRegistry: DiffStrategyRegistry,
  ) {}

  /**
   * Intercept a write operation; in Direct Mode, execute the write and record the diff to the ChangeSet (lazy creation);
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
 * Deep-serialize a {@link SerializableType} value to {@link JSONType}.
 * `Date` values are converted to ISO strings by `JSON.stringify`; other JSON-compatible types are preserved.
 */
function toJSONSafe(value: SerializableType): JSONType {
  // JSON.stringify converts Date → ISO string; JSON.parse restores a plain JSONType tree.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return JSON.parse(JSON.stringify(value)) as JSONType;
}
