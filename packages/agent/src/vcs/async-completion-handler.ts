import type { DbHandle } from "@cat/domain";
import type { ApplicationMethodRegistry } from "@cat/vcs";

import {
  getChangesetEntries,
  updateEntryAsyncStatus,
  updateChangesetAsyncStatus,
} from "@cat/domain";

/**
 * @zh 向量化异步任务完成的回调处理器。
 * 接收任务完成通知，更新对应 ChangesetEntry 的 asyncStatus，
 * 并重新计算整个 ChangeSet 的 asyncStatus 汇总。
 * @en Handler for async vectorization task completion callbacks.
 * Receives completion notifications, updates the ChangesetEntry asyncStatus,
 * and recomputes the aggregated ChangeSet asyncStatus.
 */
export class AsyncCompletionHandler {
  private readonly ctx: { db: DbHandle };

  constructor(db: DbHandle, _appMethodRegistry: ApplicationMethodRegistry) {
    this.ctx = { db };
  }

  /**
   * @zh 处理一个异步任务完成事件。
   * @en Handle one async task completion event.
   */
  async onAsyncComplete(payload: {
    asyncTaskId: string;
    entryId: number;
    changesetId: number;
    status: "completed" | "failed";
    result?: Record<string, unknown>;
    errorMessage?: string;
  }): Promise<void> {
    const entryAsyncStatus =
      payload.status === "completed" ? "READY" : "FAILED";

    // Update the specific entry's asyncStatus
    await updateEntryAsyncStatus(this.ctx, {
      entryId: payload.entryId,
      asyncStatus: entryAsyncStatus,
    });

    // Recompute changeset-level asyncStatus
    const entries = await getChangesetEntries(this.ctx, {
      changesetId: payload.changesetId,
    });
    const asyncEntries = entries.filter((e) => e.asyncStatus !== null);

    let changesetAsyncStatus:
      | "ALL_READY"
      | "HAS_PENDING"
      | "HAS_FAILED"
      | null = null;
    if (asyncEntries.length > 0) {
      if (asyncEntries.some((e) => e.asyncStatus === "FAILED")) {
        changesetAsyncStatus = "HAS_FAILED";
      } else if (asyncEntries.some((e) => e.asyncStatus === "PENDING")) {
        changesetAsyncStatus = "HAS_PENDING";
      } else {
        changesetAsyncStatus = "ALL_READY";
      }
    }

    await updateChangesetAsyncStatus(this.ctx, {
      changesetId: payload.changesetId,
      asyncStatus: changesetAsyncStatus,
    });
  }
}
