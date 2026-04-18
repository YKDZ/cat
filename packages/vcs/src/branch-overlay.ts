import type { DbHandle } from "@cat/domain";
import type { EntityType } from "@cat/shared/schema/enum";
import type { JSONType } from "@cat/shared/schema/json";

import {
  executeQuery,
  getBranchById,
  getLatestBranchChangesetId,
  listBranchChangesetEntries,
} from "@cat/domain";

/**
 * @zh 在分支上下文中读取实体：先查分支内最近的变更 entry，再回落到 main 数据。
 * 如果分支内有 DELETE 记录，返回 null（表示被删除）。
 * 如果分支内有 CREATE/UPDATE 记录，返回 after 数据。
 * 如果分支内无变更，返回 null（调用方负责从 main 读取）。
 * @en Reads an entity in branch context: checks the most recent branch changeset entry first,
 * then falls back to main data.
 * Returns null if deleted in branch, or if no branch changes exist (caller reads from main).
 */
export async function readWithOverlay<T extends Record<string, unknown>>(
  db: DbHandle,
  branchId: number,
  entityType: EntityType,
  entityId: string,
): Promise<
  | { data: T; action: "CREATE" | "UPDATE" }
  | { data: null; action: "DELETE" }
  | null
> {
  const entries = await executeQuery({ db }, listBranchChangesetEntries, {
    branchId,
    entityType,
    entityId,
    limit: 1,
  });

  const latestEntry = entries[0];

  if (!latestEntry) {
    // No branch changes — caller should read from main
    return null;
  }

  if (latestEntry.action === "DELETE") {
    return { data: null, action: "DELETE" };
  }

  // CREATE or UPDATE: return the `after` state
  if (latestEntry.after !== null && latestEntry.after !== undefined) {
    return {
      // Overlay data is stored as plain JSON in the changeset; cast to the
      // caller-declared domain type T (dates arrive as ISO strings).
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      data: latestEntry.after as unknown as T,
      action: latestEntry.action,
    };
  }

  return null;
}

/**
 * @zh 列表查询的 overlay：将 main 数据与分支变更合并（CREATE 追加，DELETE 剔除，UPDATE 覆盖）。
 * @en List query overlay: merges main data with branch changes
 * (CREATE appended, DELETE removed, UPDATE overwritten).
 */
export async function listWithOverlay<T extends Record<string, unknown>>(
  db: DbHandle,
  branchId: number,
  entityType: EntityType,
  mainItems: T[],
  getItemId: (item: T) => string,
): Promise<T[]> {
  const branchEntries = await executeQuery({ db }, listBranchChangesetEntries, {
    branchId,
    entityType,
  });

  // Build a map of entityId → latest branch action/after (entries are ordered DESC by id)
  const branchMap = new Map<
    string,
    { action: string; after: JSONType | null | undefined }
  >();

  for (const entry of branchEntries) {
    if (!branchMap.has(entry.entityId)) {
      branchMap.set(entry.entityId, {
        action: entry.action,
        after: entry.after as JSONType | null | undefined,
      });
    }
  }

  const result: T[] = [];

  for (const item of mainItems) {
    const id = getItemId(item);
    const branchEntry = branchMap.get(id);

    if (!branchEntry) {
      result.push(item);
    } else if (branchEntry.action === "DELETE") {
      // Deleted in branch — skip
    } else if (
      (branchEntry.action === "UPDATE" || branchEntry.action === "CREATE") &&
      branchEntry.after !== null &&
      branchEntry.after !== undefined
    ) {
      // Overlay data is plain JSON from the changeset; cast to T at the boundary.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      result.push(branchEntry.after as unknown as T);
      branchMap.delete(id);
    }
  }

  // Add branch-only CREATEs (not present in main)
  for (const [id, entry] of branchMap.entries()) {
    if (
      entry.action === "CREATE" &&
      entry.after !== null &&
      entry.after !== undefined
    ) {
      const existsInMain = mainItems.some((item) => getItemId(item) === id);
      if (!existsInMain) {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        result.push(entry.after as unknown as T);
      }
    }
  }

  return result;
}

/**
 * @zh 获取分支关联的最新 changeset ID（用于向该 changeset 写入 entry）。
 * @en Gets the latest changeset ID associated with the given branch.
 */
export async function getBranchChangesetId(
  db: DbHandle,
  branchId: number,
): Promise<number | null> {
  return executeQuery({ db }, getLatestBranchChangesetId, { branchId });
}

/**
 * @zh 获取分支的 baseChangesetId。
 * @en Gets the baseChangesetId of a branch.
 */
export async function getBranchBaseChangesetId(
  db: DbHandle,
  branchId: number,
): Promise<number | null> {
  const branch = await executeQuery({ db }, getBranchById, { branchId });
  return branch?.baseChangesetId ?? null;
}
