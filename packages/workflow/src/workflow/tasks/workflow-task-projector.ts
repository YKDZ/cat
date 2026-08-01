import { createHash } from "node:crypto";

import {
  executeQuery,
  listLocalizationTasksForWorkflow,
  TaskDispatchClaimConflictError,
  type DbHandle,
  type LocalizationTaskSummary,
} from "@cat/domain";
import { JSONObjectSchema } from "@cat/shared";

import type { Checkpointer } from "#/graph/checkpointer/index.ts";
import type { AgentEventBus } from "#/graph/event-bus.ts";
import type { AgentEvent } from "#/graph/events.ts";
import { createAgentEvent } from "#/graph/events.ts";
import type { Scheduler } from "#/graph/scheduler.ts";
import { defaultWorkflowLogger } from "#/graph/workflow-logger.ts";

import { batchAutoTranslateGraph } from "./batch-auto-translate.ts";
import { BatchAutoTranslationTaskAdapter } from "./batch-auto-translation-task-adapter.ts";

const taskIdFromMetadata = (metadata: unknown): string | null => {
  if (typeof metadata !== "object" || metadata === null) return null;
  if (!("localizationTaskId" in metadata)) return null;
  const value = metadata.localizationTaskId;
  return typeof value === "string" ? value : null;
};

const deterministicUuid = (value: string): string => {
  const hash = createHash("sha256").update(value).digest("hex").slice(0, 32);
  const chars = hash.split("");
  chars[12] = "4";
  chars[16] = ((Number.parseInt(chars[16] ?? "0", 16) & 0x3) | 0x8).toString(
    16,
  );
  return `${chars.slice(0, 8).join("")}-${chars.slice(8, 12).join("")}-${chars.slice(12, 16).join("")}-${chars.slice(16, 20).join("")}-${chars.slice(20).join("")}`;
};

const isProjectionEvent = (event: AgentEvent): boolean =>
  event.type === "workflow:task:progress" || event.type === "run:end";

export class WorkflowTaskProjector {
  private readonly db: DbHandle;
  private readonly eventBus: AgentEventBus;
  private readonly checkpointer: Checkpointer;
  private readonly scheduler: Scheduler;
  private readonly unsubscribe: Array<() => void> = [];
  private readonly runQueues = new Map<string, Promise<void>>();
  private reconciliationTimer: ReturnType<typeof setInterval> | null = null;
  private reconciliation: Promise<void> | null = null;

  constructor(input: {
    db: DbHandle;
    eventBus: AgentEventBus;
    checkpointer: Checkpointer;
    scheduler: Scheduler;
  }) {
    this.db = input.db;
    this.eventBus = input.eventBus;
    this.checkpointer = input.checkpointer;
    this.scheduler = input.scheduler;
  }

  install(): void {
    const handle = async (event: AgentEvent): Promise<void> => {
      await this.enqueue(event);
    };
    this.unsubscribe.push(
      this.eventBus.subscribe("workflow:task:progress", handle),
      this.eventBus.subscribe("run:end", handle),
    );
    this.reconciliationTimer = setInterval(() => {
      void this.reconcile().catch((error: unknown) => {
        defaultWorkflowLogger.scheduler("task-reconciliation:error", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, 10_000);
    this.reconciliationTimer.unref?.();
  }

  async dispose(): Promise<void> {
    for (const unsubscribe of this.unsubscribe.splice(0)) unsubscribe();
    if (this.reconciliationTimer) clearInterval(this.reconciliationTimer);
    this.reconciliationTimer = null;
    await Promise.allSettled(this.runQueues.values());
    if (this.reconciliation) await this.reconciliation;
  }

  async projectEvent(event: AgentEvent): Promise<void> {
    if (!isProjectionEvent(event)) return;

    // Event persistence happens before projection so a crash at any later point
    // is replayable. The insert is idempotent by (run, eventId).
    const sequence = await this.checkpointer.saveEvent(event);
    const metadata = await this.checkpointer.loadRunMetadata(event.runId);
    const taskId = taskIdFromMetadata(metadata?.metadata);
    if (!taskId) return;

    const adapter = await BatchAutoTranslationTaskAdapter.hydrate(
      this.db,
      taskId,
    );
    await this.applyEvent(
      adapter,
      sequence === null ? event : { ...event, sequence },
    );
  }

  async reconcile(): Promise<void> {
    if (this.reconciliation) return await this.reconciliation;
    this.reconciliation = this.reconcileAll();
    try {
      await this.reconciliation;
    } finally {
      this.reconciliation = null;
    }
  }

  private async reconcileAll(): Promise<void> {
    const tasks = await executeQuery(
      { db: this.db },
      listLocalizationTasksForWorkflow,
      {},
    );
    for (const task of tasks) {
      // oxlint-disable-next-line no-await-in-loop
      await this.reconcileTask(task);
    }
  }

  private async reconcileTask(task: LocalizationTaskSummary): Promise<void> {
    const runId = task.state.runtime.runId;
    if (!runId) {
      if (task.state.status === "CANCEL_REQUESTED") {
        const adapter = await BatchAutoTranslationTaskAdapter.hydrate(
          this.db,
          task.id,
        );
        try {
          await adapter.confirmCancel({
            requestId: deterministicUuid(`${task.id}:undispatched:cancel`),
          });
        } catch (error) {
          if (!(error instanceof TaskDispatchClaimConflictError)) throw error;
        }
      }
      return;
    }

    const adapter = await BatchAutoTranslationTaskAdapter.hydrate(
      this.db,
      task.id,
    );
    const cursor = task.state.runtime.lastProjectedEventSequence ?? 0;
    const events = await this.checkpointer.listEvents(runId, cursor);
    for (const event of events) {
      if (!isProjectionEvent(event)) continue;
      // oxlint-disable-next-line no-await-in-loop
      await this.applyEvent(adapter, event);
    }

    await adapter.refresh();
    const metadata = await this.checkpointer.loadRunMetadata(runId);
    if (!metadata) return;
    if (
      adapter.task.state.status === "CANCEL_REQUESTED" &&
      (metadata.status === "running" || metadata.status === "paused")
    ) {
      if (this.scheduler.hasRun(runId)) await this.scheduler.cancel(runId);
      return;
    }
    if (
      adapter.task.state.status === "CANCEL_REQUESTED" &&
      metadata.status === "cancelled"
    ) {
      await adapter.confirmCancel({
        requestId: deterministicUuid(`${runId}:terminal:cancel`),
        expectedRunId: runId,
      });
      return;
    }
    if (
      adapter.task.state.status === "CANCEL_REQUESTED" &&
      metadata.status !== "running" &&
      metadata.status !== "paused"
    ) {
      await this.projectPersistedTerminal(adapter, runId, metadata.status);
      return;
    }
    if (
      adapter.task.state.status === "RUNNING" &&
      metadata.status !== "running" &&
      metadata.status !== "paused"
    ) {
      await this.projectPersistedTerminal(adapter, runId, metadata.status);
      return;
    }
    if (
      adapter.task.state.status === "PENDING" &&
      metadata.status !== "running" &&
      metadata.status !== "paused"
    ) {
      await adapter.fail(
        {
          code: "CAT_OPERATION_FAILED",
          message: "Workflow allocation ended before the task started.",
          severity: "ERROR",
          retryable: true,
          affectedResources: adapter.task.state.resources,
          remediationHint: "Retry the task to allocate a new workflow run.",
          redactionBoundary: "INTERNAL",
        },
        {
          requestId: deterministicUuid(`${runId}:allocation:failed`),
          expectedRunId: runId,
        },
      );
    }
  }

  private async projectPersistedTerminal(
    adapter: BatchAutoTranslationTaskAdapter,
    runId: string,
    status: string,
  ): Promise<void> {
    if (status === "completed") {
      const snapshot = await this.checkpointer.loadSnapshot(runId);
      if (!snapshot) return;
      await this.applyEvent(
        adapter,
        createAgentEvent({
          eventId: deterministicUuid(`${runId}:recovery:completed`),
          runId,
          type: "run:end",
          timestamp: new Date().toISOString(),
          payload: { status, blackboard: snapshot.data },
        }),
      );
      return;
    }
    if (status === "cancelled") {
      await adapter.requestCancel({
        requestId: deterministicUuid(`${runId}:recovery:request-cancel`),
        expectedRunId: runId,
      });
      await adapter.confirmCancel({
        requestId: deterministicUuid(`${runId}:recovery:cancelled`),
        expectedRunId: runId,
      });
      return;
    }
    const events = await this.checkpointer.listEvents(runId);
    const runError = events.findLast((event) => event.type === "run:error");
    if (runError?.type === "run:error") {
      await this.applyEvent(
        adapter,
        createAgentEvent({
          eventId: deterministicUuid(`${runId}:recovery:failed`),
          runId,
          type: "run:end",
          timestamp: new Date().toISOString(),
          payload: { status: "failed" },
        }),
      );
      return;
    }
    await adapter.fail(
      {
        code: "CAT_OPERATION_FAILED",
        message: "Workflow execution was interrupted by process recovery.",
        severity: "ERROR",
        retryable: true,
        affectedResources: adapter.task.state.resources,
        remediationHint: "Retry the task to start a new workflow run.",
        redactionBoundary: "INTERNAL",
      },
      {
        requestId: deterministicUuid(`${runId}:recovery:failed`),
        expectedRunId: runId,
      },
    );
  }

  private enqueue(event: AgentEvent): Promise<void> {
    const previous = this.runQueues.get(event.runId) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            // oxlint-disable-next-line no-await-in-loop
            await this.projectEvent(event);
            return undefined;
          } catch (error) {
            lastError = error;
          }
        }
        defaultWorkflowLogger.scheduler("task-projection:deferred", {
          runId: event.runId,
          eventId: event.eventId,
          error:
            lastError instanceof Error ? lastError.message : String(lastError),
        });
        return undefined;
      })
      .finally(() => {
        if (this.runQueues.get(event.runId) === current) {
          this.runQueues.delete(event.runId);
        }
      });
    this.runQueues.set(event.runId, current);
    return current;
  }

  private async applyEvent(
    adapter: BatchAutoTranslationTaskAdapter,
    event: AgentEvent,
  ): Promise<void> {
    await adapter.refresh();
    if (adapter.task.state.runtime.runId !== event.runId) return;
    const identity = {
      requestId: event.eventId,
      projectionEventId: event.eventId,
      expectedRunId: event.runId,
      ...(event.sequence === undefined
        ? {}
        : { projectionEventSequence: event.sequence }),
    };
    if (event.type === "workflow:task:progress") {
      await adapter.progress(
        {
          current: event.payload.current,
          total: event.payload.total,
          phase: event.payload.phase,
        },
        identity,
      );
      return;
    }
    if (event.type !== "run:end") return;

    await adapter.refresh();
    if (event.payload.status === "completed") {
      const blackboard = JSONObjectSchema.parse(event.payload.blackboard);
      const result = batchAutoTranslateGraph.extractResult({
        data: blackboard,
      });
      await adapter.complete(result, identity);
      return;
    }
    if (event.payload.status === "cancelled") {
      await adapter.requestCancel({
        requestId: deterministicUuid(`${event.eventId}:request-cancel`),
        expectedRunId: event.runId,
      });
      await adapter.confirmCancel(identity);
      return;
    }

    const events = await this.checkpointer.listEvents(event.runId);
    const runError = events.findLast(
      (candidate) => candidate.type === "run:error",
    );
    const message =
      runError?.type === "run:error"
        ? runError.payload.error
        : "Workflow execution failed.";
    const typedFailure =
      runError?.type === "run:error"
        ? runError.payload.operationFailure
        : undefined;
    if (
      typedFailure?.capability === "LANGUAGE_ANALYSIS" &&
      typedFailure.blocker !== undefined &&
      adapter.task.state.status !== "CANCEL_REQUESTED"
    ) {
      await adapter.block(
        { ...typedFailure, affectedResources: adapter.task.state.resources },
        identity,
      );
      return;
    }
    await adapter.fail(
      typedFailure
        ? { ...typedFailure, affectedResources: adapter.task.state.resources }
        : {
            code: "CAT_OPERATION_FAILED",
            message,
            severity: "ERROR",
            retryable: true,
            affectedResources: adapter.task.state.resources,
            remediationHint: "Inspect the failure and retry the task.",
            redactionBoundary: "INTERNAL",
          },
      identity,
    );
  }
}
