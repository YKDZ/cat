import type { DbHandle } from "@cat/domain";
import type { JSONType } from "@cat/shared";

import {
  addChangesetEntry,
  batchUpdateEntryBefore,
  createChangeset,
  executeCommand,
  executeQuery,
  getBranchById,
  getLatestMainChangesetId,
  listBranchChangesetEntries,
  listBranchChangesetIds,
  listMainEntriesSince,
  markBranchConflicted,
  updateBranchBaseChangeset,
  updateBranchStatus,
} from "@cat/domain";

import type { ApplicationMethodRegistry } from "./application-method-registry.ts";

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface ConflictInfo {
  entityType: string;
  entityId: string;
  branchAction: string;
  mainAction: string;
  branchAfter: JSONType | null | undefined;
  mainAfter: JSONType | null | undefined;
}

export interface MergeResult {
  success: boolean;
  hasConflicts: boolean;
  conflicts: ConflictInfo[];
  mainChangesetId?: number;
}

export interface RebaseResult {
  success: boolean;
  newBaseChangesetId: number | null;
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * @zh 检测冲突：比较 branch 创建以来 main 上的变更与 branch 自身的变更。
 * @en Detects conflicts: compares main changes since branch creation with branch changes.
 */
export async function detectConflicts(
  db: DbHandle,
  branchId: number,
): Promise<ConflictInfo[]> {
  const branch = await executeQuery({ db }, getBranchById, { branchId });
  if (!branch || branch.baseChangesetId === null) {
    return [];
  }

  // Get all branch changeset entries
  const branchEntries = await executeQuery({ db }, listBranchChangesetEntries, {
    branchId,
  });
  if (branchEntries.length === 0) return [];

  // Get main entries since branch base
  const mainEntries = await executeQuery({ db }, listMainEntriesSince, {
    projectId: branch.projectId,
    baseChangesetId: branch.baseChangesetId,
  });

  // Build a map of entityType:entityId → latest main entry
  const mainMap = new Map<
    string,
    { action: string; after: JSONType | null | undefined }
  >();
  for (const row of mainEntries) {
    const key = `${row.entityType}:${row.entityId}`;
    // last write wins for same entity
    mainMap.set(key, {
      action: row.action,
      after: row.after as JSONType | null | undefined,
    });
  }

  const conflicts: ConflictInfo[] = [];
  for (const entry of branchEntries) {
    const key = `${entry.entityType}:${entry.entityId}`;
    const mainEntry = mainMap.get(key);
    if (mainEntry) {
      conflicts.push({
        entityType: entry.entityType,
        entityId: entry.entityId,
        branchAction: entry.action,
        mainAction: mainEntry.action,
        branchAfter: entry.after as JSONType | null | undefined,
        mainAfter: mainEntry.after,
      });
    }
  }

  return conflicts;
}

/**
 * @zh 合并分支到 main：
 * 1. 检测冲突
 * 2. 如有冲突，标记 hasConflicts=true 并返回
 * 3. 如无冲突，将分支变更作为新 main Changeset 应用
 * 4. 更新 branch status=MERGED
 * @en Merges a branch into main:
 * 1. Detect conflicts
 * 2. If conflicts exist, mark hasConflicts=true and return
 * 3. If no conflicts, apply branch changes as a new main changeset
 * 4. Update branch status=MERGED
 *
 * @param mergedByUserId - UUID of the user performing the merge (or null for agent-initiated merges)
 */
export async function mergeBranch(
  db: DbHandle,
  branchId: number,
  mergedByUserId: string | null,
): Promise<MergeResult> {
  const branch = await executeQuery({ db }, getBranchById, { branchId });
  if (!branch) {
    throw new Error(`Branch ${branchId} not found`);
  }
  if (branch.status !== "ACTIVE") {
    throw new Error(
      `Branch ${branchId} is not ACTIVE (status: ${branch.status})`,
    );
  }

  const conflicts = await detectConflicts(db, branchId);
  if (conflicts.length > 0) {
    await executeCommand({ db }, markBranchConflicted, {
      branchId,
      hasConflicts: true,
    });
    return { success: false, hasConflicts: true, conflicts };
  }

  // Get all changeset IDs belonging to this branch
  const branchCsIds = await executeQuery({ db }, listBranchChangesetIds, {
    branchId,
  });

  if (branchCsIds.length > 0) {
    // Create a new main (no branchId) changeset for the merged changes
    const newCs = await executeCommand({ db }, createChangeset, {
      projectId: branch.projectId,
      createdBy: mergedByUserId ?? undefined,
      summary: `Merge branch ${branchId}`,
      status: "APPLIED",
    });

    // Copy all branch entries into the new main changeset
    const allBranchEntries = await executeQuery(
      { db },
      listBranchChangesetEntries,
      { branchId },
    );

    await Promise.all(
      allBranchEntries.map(async (e) =>
        executeCommand({ db }, addChangesetEntry, {
          changesetId: newCs.id,
          entityType: e.entityType,
          entityId: e.entityId,
          action: e.action,
          before: e.before ?? undefined,
          after: e.after ?? undefined,
          fieldPath: e.fieldPath ?? undefined,
          riskLevel: e.riskLevel,
        }),
      ),
    );

    await executeCommand({ db }, updateBranchStatus, {
      branchId,
      status: "MERGED",
      mergedAt: new Date(),
    });

    return {
      success: true,
      hasConflicts: false,
      conflicts: [],
      mainChangesetId: newCs.id,
    };
  }

  // Empty branch — just mark as merged
  await executeCommand({ db }, updateBranchStatus, {
    branchId,
    status: "MERGED",
    mergedAt: new Date(),
  });

  return { success: true, hasConflicts: false, conflicts: [] };
}

/**
 * @zh Rebase：更新 branch 的 baseChangesetId 到 main 最新，并重写 UPDATE/DELETE entry 的 before 值。
 * @en Rebase: updates the branch's baseChangesetId to the latest main changeset and rewrites
 * the before-values of UPDATE/DELETE entries to reflect the current main state.
 */
export async function rebaseBranch(
  db: DbHandle,
  branchId: number,
  appMethodRegistry: ApplicationMethodRegistry,
): Promise<RebaseResult> {
  const branch = await executeQuery({ db }, getBranchById, { branchId });
  if (!branch) {
    throw new Error(`Branch ${branchId} not found`);
  }

  const newBaseChangesetId = await executeQuery(
    { db },
    getLatestMainChangesetId,
    { projectId: branch.projectId },
  );

  await executeCommand({ db }, updateBranchBaseChangeset, {
    branchId,
    baseChangesetId: newBaseChangesetId,
  });

  // 2. Rewrite before-values for UPDATE/DELETE entries
  const branchEntries = await executeQuery({ db }, listBranchChangesetEntries, {
    branchId,
  });

  const entriesToRewrite = branchEntries.filter(
    (e) => e.action === "UPDATE" || e.action === "DELETE",
  );

  if (entriesToRewrite.length > 0) {
    // Group by entityType for batch query optimization
    const grouped = new Map<string, typeof entriesToRewrite>();
    for (const entry of entriesToRewrite) {
      const list = grouped.get(entry.entityType) ?? [];
      list.push(entry);
      grouped.set(entry.entityType, list);
    }

    const updateBatches = await Promise.all(
      [...grouped.entries()].map(async ([entityType, entries]) => {
        if (!appMethodRegistry.has(entityType)) return [];

        const method = appMethodRegistry.get(entityType);
        const entityIds = entries.map((e) => e.entityId);
        const stateMap = await method.fetchCurrentStates(entityIds, {
          projectId: branch.projectId,
        });

        const batch: Array<{ entryId: number; before: unknown }> = [];
        for (const entry of entries) {
          if (!stateMap.has(entry.entityId)) continue;
          batch.push({
            entryId: entry.id,
            before: stateMap.get(entry.entityId) ?? null,
          });
        }
        return batch;
      }),
    );

    const updates = updateBatches.flat();

    if (updates.length > 0) {
      await executeCommand({ db }, batchUpdateEntryBefore, { updates });
    }
  }

  return { success: true, newBaseChangesetId };
}
