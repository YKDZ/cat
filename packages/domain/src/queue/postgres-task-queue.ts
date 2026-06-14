import type { QueueTask, TaskQueue } from "@cat/core";
import type { DrizzleClient } from "@cat/db";
import type { NonNullJSONType } from "@cat/shared";

import { and, eq, runtimeQueueTask, sql } from "@cat/db";

/**
 * Optional configuration for the PostgreSQL task queue.
 */
export type PostgresTaskQueueOptions = {
  /**
   * Lease duration in milliseconds.
   */
  leaseMs?: number;
  /**
   * Maximum retry count.
   */
  maxRetries?: number;
};

/**
 * PostgreSQL-backed at-least-once task queue implementation.
 */
export class PostgresTaskQueue<
  T extends NonNullJSONType,
> implements TaskQueue<T> {
  private readonly leaseMs: number;
  private readonly maxRetries: number;

  /**
   * Create a PostgreSQL-backed task queue.
   *
   * @param db - Drizzle database client
   * @param queueName - Queue name
   * @param options - Optional lease and retry configuration
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
   * Enqueue tasks in batch.
   *
   * @param payloads - List of task payloads to enqueue
   * @returns - Newly generated task IDs
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
   * Dequeue up to `maxCount` pending tasks and lease them.
   *
   * @param maxCount - Maximum number of tasks to dequeue
   * @returns - Dequeued task list
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
   * Acknowledge task completion.
   *
   * @param taskId - Task ID
   * @returns - No return value
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
   * Reject a task and requeue it or mark it failed depending on retry count.
   *
   * @param taskId - Task ID
   * @returns - No return value
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
   * Get the number of pending tasks in the queue.
   *
   * @returns - Pending task count
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
   * Requeue tasks whose leases have expired.
   *
   * @returns - Number of tasks requeued
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
