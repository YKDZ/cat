// packages/operations/src/rebase-pr-full.ts
import type { DrizzleClient } from "@cat/domain";
import type { ConflictInfo, RebaseResult } from "@cat/vcs";

import {
  executeCommand,
  executeQuery,
  getBranchById,
  getPR,
  markBranchConflicted,
} from "@cat/domain";
import { detectConflicts, rebaseBranch } from "@cat/vcs";

/**
 * @zh rebasePRFull 的输入参数。
 * @en Input parameters for rebasePRFull.
 */
export interface RebasePRFullInput {
  /** @zh PR 的 externalId (UUID) @en PR externalId (UUID) */
  prExternalId: string;
}

/**
 * @zh rebasePRFull 的返回结果。
 * @en Result of rebasePRFull.
 */
export interface RebasePRFullResult {
  success: boolean;
  newBaseChangesetId: number | null;
  hasConflicts: boolean;
  conflicts: ConflictInfo[];
}

/**
 * @zh 完整 PR rebase 操作：基线移动 → 冲突检测 → branch 状态同步。
 * @en Full PR rebase operation: baseline move → conflict detection → branch status sync.
 */
export const rebasePRFull = async (
  ctx: { db: DrizzleClient },
  input: RebasePRFullInput,
): Promise<RebasePRFullResult> => {
  const { db } = ctx;

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

  return await db.transaction(async (tx) => {
    const rebaseResult: RebaseResult = await rebaseBranch(tx, pr.branchId);
    const conflicts: ConflictInfo[] = await detectConflicts(tx, pr.branchId);

    await executeCommand({ db: tx }, markBranchConflicted, {
      branchId: pr.branchId,
      hasConflicts: conflicts.length > 0,
    });

    return {
      success: true,
      newBaseChangesetId: rebaseResult.newBaseChangesetId,
      hasConflicts: conflicts.length > 0,
      conflicts,
    };
  });
};
