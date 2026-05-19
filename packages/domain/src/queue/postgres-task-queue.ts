import type { QueueTask, TaskQueue } from "@cat/core";
import type { DrizzleClient } from "@cat/db";
import type { NonNullJSONType } from "@cat/shared";

import { and, eq, runtimeQueueTask, sql } from "@cat/db";

/**
 * @zh PostgreSQL 任务队列的可选参数。
 * @en Optional configuration for the PostgreSQL task queue.
 */
export type PostgresTaskQueueOptions = {
  /**
   * @zh 单次租约时长（毫秒）。
   * @en Lease duration in milliseconds.
   */
  leaseMs?: number;
  /**
   * @zh 最大重试次数。
   * @en Maximum retry count.
   */
  maxRetries?: number;
};

/**
 * @zh 基于 PostgreSQL 的 at-least-once 任务队列实现。
 * @en PostgreSQL-backed at-least-once task queue implementation.
 */
export class PostgresTaskQueue<
  T extends NonNullJSONType,
> implements TaskQueue<T> {
  private readonly leaseMs: number;
  private readonly maxRetries: number;

  /**
   * @zh 创建一个 PostgreSQL 任务队列。
   * @en Create a PostgreSQL-backed task queue.
   *
   * @param db - {@zh Drizzle 数据库客户端} {@en Drizzle database client}
   * @param queueName - {@zh 队列名称} {@en Queue name}
   * @param options - {@zh 可选租约与重试配置} {@en Optional lease and retry configuration}
   */
  public constructor(
    private readonly db: DrizzleClient,
    private readonly queueName: string,
    options: PostgresTaskQueueOptions = {},
  ) {
    this.leaseMs = options.leaseMs ?? 60_000;
    this.maxRetries = options.maxRetries ?? 3;
  }

  /**
   * @zh 批量入队任务。
   * @en Enqueue tasks in batch.
   *
   * @param payloads - {@zh 要入队的任务负载列表} {@en List of task payloads to enqueue}
   * @returns - {@zh 新生成的任务 ID 列表} {@en Newly generated task IDs}
   */
  public async enqueue(payloads: T[]): Promise<string[]> {
    if (payloads.length === 0) return [];

    const now = new Date();
    const rows = payloads.map((payload) => ({
      queueName: this.queueName,
      taskId: crypto.randomUUID(),
      payload,
      status: "PENDING" as const,
      enqueuedAt: now,
    }));

    await this.db.insert(runtimeQueueTask).values(rows);
    return rows.map((row) => row.taskId);
  }

  /**
   * @zh 取出最多 `maxCount` 个待处理任务并为其加租约。
   * @en Dequeue up to `maxCount` pending tasks and lease them.
   *
   * @param maxCount - {@zh 最大出队数量} {@en Maximum number of tasks to dequeue}
   * @returns - {@zh 出队后的任务列表} {@en Dequeued task list}
   */
  public async dequeue(maxCount: number): Promise<QueueTask<T>[]> {
    await this.requeueExpiredLeases();
    const leasedUntil = new Date(Date.now() + this.leaseMs);

    return this.db.transaction(async (tx) => {
      const result = await tx.execute<{
        id: string;
        payload: T;
        retryCount: number;
        enqueuedAt: Date | string;
      }>(sql`
        UPDATE "RuntimeQueueTask"
        SET status = 'PROCESSING', leased_until = ${leasedUntil}, updated_at = NOW()
        WHERE (queue_name, task_id) IN (
          SELECT queue_name, task_id
          FROM "RuntimeQueueTask"
          WHERE queue_name = ${this.queueName} AND status = 'PENDING'
          ORDER BY enqueued_at ASC
          LIMIT ${maxCount}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING task_id AS id, payload, retry_count AS "retryCount", enqueued_at AS "enqueuedAt"
      `);

      return result.rows.map((row) => ({
        id: row.id,
        payload: row.payload,
        retryCount: row.retryCount,
        enqueuedAt: new Date(row.enqueuedAt).toISOString(),
      }));
    });
  }

  /**
   * @zh 确认任务完成。
   * @en Acknowledge task completion.
   *
   * @param taskId - {@zh 任务 ID} {@en Task ID}
   * @returns - {@zh 无返回值} {@en No return value}
   */
  public async ack(taskId: string): Promise<void> {
    await this.db
      .update(runtimeQueueTask)
      .set({ status: "SUCCEEDED", leasedUntil: null, updatedAt: new Date() })
      .where(
        and(
          eq(runtimeQueueTask.queueName, this.queueName),
          eq(runtimeQueueTask.taskId, taskId),
        ),
      );
  }

  /**
   * @zh 拒绝任务并根据重试次数重新入队或标记失败。
   * @en Reject a task and requeue it or mark it failed depending on retry count.
   *
   * @param taskId - {@zh 任务 ID} {@en Task ID}
   * @returns - {@zh 无返回值} {@en No return value}
   */
  public async nack(taskId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ retryCount: runtimeQueueTask.retryCount })
        .from(runtimeQueueTask)
        .where(
          and(
            eq(runtimeQueueTask.queueName, this.queueName),
            eq(runtimeQueueTask.taskId, taskId),
          ),
        )
        .limit(1);

      if (!row) return;

      const retryCount = row.retryCount + 1;
      await tx
        .update(runtimeQueueTask)
        .set({
          retryCount,
          status: retryCount >= this.maxRetries ? "FAILED" : "PENDING",
          leasedUntil: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(runtimeQueueTask.queueName, this.queueName),
            eq(runtimeQueueTask.taskId, taskId),
          ),
        );
    });
  }

  /**
   * @zh 获取当前队列中待处理任务数量。
   * @en Get the number of pending tasks in the queue.
   *
   * @returns - {@zh 待处理任务数量} {@en Pending task count}
   */
  public async pendingCount(): Promise<number> {
    const result = await this.db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text AS count
      FROM "RuntimeQueueTask"
      WHERE queue_name = ${this.queueName} AND status = 'PENDING'
    `);

    return Number(result.rows[0]?.count ?? 0);
  }

  /**
   * @zh 将租约过期的任务重新放回待处理状态。
   * @en Requeue tasks whose leases have expired.
   *
   * @returns - {@zh 被重新入队的任务数量} {@en Number of tasks requeued}
   */
  public async requeueExpiredLeases(): Promise<number> {
    const result = await this.db.execute<{ task_id: string }>(sql`
      UPDATE "RuntimeQueueTask"
      SET status = 'PENDING', leased_until = NULL, updated_at = NOW()
      WHERE queue_name = ${this.queueName}
        AND status = 'PROCESSING'
        AND leased_until < NOW()
      RETURNING task_id
    `);

    return result.rows.length;
  }
}
