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
  private readonly changeSetService: ChangeSetService;
  private readonly diffRegistry: DiffStrategyRegistry;

  constructor(
    changeSetService: ChangeSetService,
    diffRegistry: DiffStrategyRegistry,
  ) {
    this.changeSetService = changeSetService;
    this.diffRegistry = diffRegistry;
  }

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

    await this.recordWrite(ctx, entityType, entityId, action, before, after);

    return result;
  }

  /**
   * Direct-mode interception for canonical commands that allocate their
   * durable identity and final snapshot during the write.
   */
  async interceptResolvedWrite<T>(
    ctx: VCSContext,
    entityType: string,
    action: "CREATE" | "UPDATE" | "DELETE",
    before: SerializableType,
    writeFn: () => Promise<{
      entityId: string;
      after: SerializableType;
      result: T;
    }>,
  ): Promise<T> {
    if (ctx.mode !== "direct") {
      throw new TypeError("Resolved VCS writes require direct mode.");
    }
    const applied = await writeFn();
    await this.recordWrite(
      ctx,
      entityType,
      applied.entityId,
      action,
      before,
      applied.after,
    );
    return applied.result;
  }

  /** Records the canonical command's locked before/after aggregate snapshots. */
  async interceptMutationWrite<T>(
    ctx: VCSContext,
    entityType: string,
    writeFn: () => Promise<
      | {
          entityId: string;
          action: "CREATE" | "UPDATE" | "DELETE";
          before: SerializableType;
          after: SerializableType;
          result: T;
        }
      | { mutation: null; result: T }
    >,
  ): Promise<T> {
    if (ctx.mode !== "direct") {
      throw new TypeError("Canonical mutation VCS writes require direct mode.");
    }
    const applied = await writeFn();
    if ("mutation" in applied) return applied.result;
    await this.recordWrite(
      ctx,
      entityType,
      applied.entityId,
      applied.action,
      applied.before,
      applied.after,
    );
    return applied.result;
  }

  private async recordWrite(
    ctx: VCSContext,
    entityType: string,
    entityId: string,
    action: "CREATE" | "UPDATE" | "DELETE",
    before: SerializableType,
    after: SerializableType,
  ): Promise<void> {
    if (ctx.mode !== "direct") {
      throw new Error(
        "Committed-write recording is only valid in direct mode.",
      );
    }
    const beforeJSON = toJSONSafe(before);
    const afterJSON = toJSONSafe(after);

    // Lazy changeset creation: create on the first direct audit entry.
    if (ctx.currentChangesetId === undefined) {
      const cs = await this.changeSetService.createChangeSet({
        projectId: ctx.projectId,
        ...(ctx.createdBy === undefined ? {} : { createdBy: ctx.createdBy }),
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
