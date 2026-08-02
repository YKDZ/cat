import type { DbHandle } from "@cat/domain";
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
  lockActiveBranchChangesets,
  markBranchConflicted,
  updateBranchBaseChangeset,
  updateBranchStatus,
} from "@cat/domain";
import type { JSONType } from "@cat/shared";

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
 * Detects conflicts: compares main changes since branch creation with branch changes.
 */
export async function detectConflicts(
  db: DbHandle,
  branchId: number,
): Promise<ConflictInfo[]> {
  const branch = await executeQuery({ db }, getBranchById, { branchId });
  if (!branch) {
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
 * 1. 检测冲突
 * 2. 如有冲突，标记 hasConflicts=true 并返回
 * 3. 如无冲突，将分支变更作为新 main Changeset 应用
 * 4. 更新 branch status=MERGED
 * Merges a branch into main:
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
  return await db.transaction(async (tx) => {
    const branch = await executeCommand(
      { db: tx },
      lockActiveBranchChangesets,
      { branchId },
    );

    const conflicts = await detectConflicts(tx, branchId);
    if (conflicts.length > 0) {
      await executeCommand({ db: tx }, markBranchConflicted, {
        branchId,
        hasConflicts: true,
      });
      return { success: false, hasConflicts: true, conflicts };
    }

    const branchCsIds = await executeQuery({ db: tx }, listBranchChangesetIds, {
      branchId,
    });

    if (branchCsIds.length > 0) {
      const newCs = await executeCommand({ db: tx }, createChangeset, {
        projectId: branch.projectId,
        createdBy: mergedByUserId ?? undefined,
        summary: `Merge branch ${branchId}`,
        status: "APPLIED",
      });

      const allBranchEntries = await executeQuery(
        { db: tx },
        listBranchChangesetEntries,
        { branchId },
      );

      for (const entry of allBranchEntries.sort(
        (left, right) => left.id - right.id,
      )) {
        await executeCommand({ db: tx }, addChangesetEntry, {
          changesetId: newCs.id,
          entityType: entry.entityType,
          entityId: entry.entityId,
          action: entry.action,
          before: entry.before ?? undefined,
          after: entry.after ?? undefined,
          fieldPath: entry.fieldPath ?? undefined,
          riskLevel: entry.riskLevel,
        });
      }

      await executeCommand({ db: tx }, updateBranchStatus, {
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

    await executeCommand({ db: tx }, updateBranchStatus, {
      branchId,
      status: "MERGED",
      mergedAt: new Date(),
    });
    return { success: true, hasConflicts: false, conflicts: [] };
  });
}

/**
 * Rebase: updates the branch's baseChangesetId to the latest main changeset and rewrites
 * the before-values of UPDATE/DELETE entries to reflect the current main state.
 */
export async function rebaseBranch(
  db: DbHandle,
  branchId: number,
  appMethodRegistry: ApplicationMethodRegistry,
): Promise<RebaseResult> {
  return await db.transaction(async (tx) => {
    const branch = await executeCommand(
      { db: tx },
      lockActiveBranchChangesets,
      { branchId },
    );

    const newBaseChangesetId = await executeQuery(
      { db: tx },
      getLatestMainChangesetId,
      { projectId: branch.projectId },
    );

    await executeCommand({ db: tx }, updateBranchBaseChangeset, {
      branchId,
      baseChangesetId: newBaseChangesetId,
    });

    // 2. Rewrite before-values for UPDATE/DELETE entries
    const branchEntries = await executeQuery(
      { db: tx },
      listBranchChangesetEntries,
      {
        branchId,
      },
    );

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
            db: tx,
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
        await executeCommand({ db: tx }, batchUpdateEntryBefore, { updates });
      }
    }

    return { success: true, newBaseChangesetId };
  });
}
