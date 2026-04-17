// packages/operations/src/merge-pr-full.ts
import type { DrizzleClient } from "@cat/domain";
import type { ConflictInfo, MergeResult } from "@cat/vcs";

import {
  executeCommand,
  executeQuery,
  getBranchById,
  getPR,
  markBranchConflicted,
  mergePR,
} from "@cat/domain";
import { ChangeSetService, getDefaultRegistries, mergeBranch } from "@cat/vcs";

/**
 * @zh mergePRFull 的输入参数。
 * @en Input parameters for mergePRFull.
 */
export interface MergePRFullInput {
  /** @zh PR 的 externalId (UUID) @en PR externalId (UUID) */
  prExternalId: string;
  mergedBy: string;
}

/**
 * @zh mergePRFull 的返回结果。
 * @en Result of mergePRFull.
 */
export interface MergePRFullResult {
  success: boolean;
  hasConflicts: boolean;
  conflicts: ConflictInfo[];
  prId: number;
  /** @zh 若成功，为 main changeset ID @en If successful, the main changeset ID */
  mainChangesetId?: number;
  /** @zh 若失败（非冲突），错误消息 @en If failed (not conflict), error message */
  errorMessage?: string;
}

/**
 * @zh 完整 PR 合并操作：冲突检测 → entry 复制到 main → 实体变更应用（全量回滚）→ 状态更新。
 * 在单个数据库事务中执行，任何步骤失败则全量回滚。
 * @en Full PR merge operation: conflict detection → entry copy to main → entity changes (full rollback) → status update.
 * Executed in a single database transaction; any step failure triggers full rollback.
 */
export const mergePRFull = async (
  ctx: { db: DrizzleClient },
  input: MergePRFullInput,
): Promise<MergePRFullResult> => {
  const { db } = ctx;

  // 1. 获取 PR 及关联 branch
  const pr = await executeQuery({ db }, getPR, { id: input.prExternalId });
  if (!pr) {
    throw new Error(`PR ${input.prExternalId} not found`);
  }

  const branch = await executeQuery({ db }, getBranchById, {
    branchId: pr.branchId,
  });
  if (!branch) {
    throw new Error(
      `Branch ${pr.branchId} not found for PR ${input.prExternalId}`,
    );
  }
  if (branch.status !== "ACTIVE") {
    throw new Error(
      `Branch ${pr.branchId} is not ACTIVE (status: ${branch.status})`,
    );
  }

  // 2. 在事务内执行完整合并
  return await db
    .transaction(async (tx) => {
      // 2a. mergeBranch: 冲突检测 + entry 复制到 main changeset
      const mergeResult: MergeResult = await mergeBranch(
        tx,
        pr.branchId,
        input.mergedBy,
      );

      if (!mergeResult.success || mergeResult.hasConflicts) {
        throw new MergePRConflictError(mergeResult.conflicts);
      }

      // 2b. 若有 mainChangesetId，执行 applyChangeSet
      if (mergeResult.mainChangesetId !== undefined) {
        const { diffRegistry, appMethodRegistry } = getDefaultRegistries();
        const csService = new ChangeSetService(
          tx,
          diffRegistry,
          appMethodRegistry,
        );

        try {
          await csService.applyChangeSet(mergeResult.mainChangesetId, {
            projectId: branch.projectId,
          });
        } catch (error) {
          throw new MergePRApplyError(
            mergeResult.mainChangesetId,
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      // 2c. 调用 mergePR 域命令更新 PR 和 branch 状态
      await executeCommand({ db: tx }, mergePR, {
        prId: pr.id,
        mergedBy: input.mergedBy,
      });

      return {
        success: true,
        hasConflicts: false,
        conflicts: [],
        prId: pr.id,
        mainChangesetId: mergeResult.mainChangesetId,
      } satisfies MergePRFullResult;
    })
    .catch(async (error: unknown) => {
      if (error instanceof MergePRConflictError) {
        return markConflictOutsideTx(db, pr.branchId, error.conflicts, pr.id);
      }
      if (error instanceof MergePRApplyError) {
        return {
          success: false,
          hasConflicts: false,
          conflicts: [],
          prId: pr.id,
          errorMessage: `applyChangeSet failed for changeset ${error.changesetId}: ${error.message}`,
        } satisfies MergePRFullResult;
      }
      throw error;
    });
};

// ─── Error Types ────────────────────────────────────────────────────────────

class MergePRConflictError extends Error {
  constructor(public readonly conflicts: ConflictInfo[]) {
    super("Merge conflicts detected");
    this.name = "MergePRConflictError";
  }
}

class MergePRApplyError extends Error {
  constructor(
    public readonly changesetId: number,
    message: string,
  ) {
    super(message);
    this.name = "MergePRApplyError";
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const markConflictOutsideTx = async (
  db: DrizzleClient,
  branchId: number,
  conflicts: ConflictInfo[],
  prId: number,
): Promise<MergePRFullResult> => {
  await executeCommand({ db }, markBranchConflicted, {
    branchId,
    hasConflicts: true,
  });
  return {
    success: false,
    hasConflicts: true,
    conflicts,
    prId,
  };
};
