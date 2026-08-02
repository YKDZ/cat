import {
  executeCommand,
  executeQuery,
  getLocalizationTaskForWorkflow,
  getWorkflowTaskDispatchByRunId,
  listWorkflowTaskDispatchesForProjection,
  projectWorkflowTaskDispatchEvent,
  requestWorkflowTaskDispatchCancel,
  type DbHandle,
  type WorkflowTaskDispatch,
} from "@cat/domain";
import { JSONObjectSchema } from "@cat/shared";

import type { Checkpointer } from "#/graph/checkpointer/index.ts";
import type {
  RunMetadata,
  RunOwnershipFence,
} from "#/graph/checkpointer/types.ts";
import type { AgentEventBus } from "#/graph/event-bus.ts";
import type { AgentEvent } from "#/graph/events.ts";
import type { Scheduler } from "#/graph/scheduler.ts";
import { defaultWorkflowLogger } from "#/graph/workflow-logger.ts";

import { batchAutoTranslateGraph } from "./batch-auto-translate.ts";

const isProjectionEvent = (
  event: AgentEvent,
): event is Extract<
  AgentEvent,
  { type: "workflow:task:progress" | "run:end" }
> => event.type === "workflow:task:progress" || event.type === "run:end";

/** Projects persisted workflow events through the owner-private dispatch binding. */
export class WorkflowTaskProjector {
  private readonly db: DbHandle;
  private readonly eventBus: AgentEventBus;
  private readonly checkpointer: Checkpointer;
  private readonly scheduler: Scheduler;
  private readonly ownerId: string;
  private readonly runQueues = new Map<string, Promise<void>>();
  private readonly unsubscribe: (() => void)[] = [];
  private reconciliation: Promise<void> | null = null;
  private reconciliationTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(input: {
    db: DbHandle;
    eventBus: AgentEventBus;
    checkpointer: Checkpointer;
    scheduler: Scheduler;
    ownerId?: string;
  }) {
    this.db = input.db;
    this.eventBus = input.eventBus;
    this.checkpointer = input.checkpointer;
    this.scheduler = input.scheduler;
    this.ownerId = input.ownerId ?? crypto.randomUUID();
  }

  install(): void {
    if (this.disposed || this.unsubscribe.length > 0) return;
    const enqueue = (event: AgentEvent) => this.enqueue(event);
    this.unsubscribe.push(
      this.eventBus.subscribe("workflow:task:progress", enqueue),
      this.eventBus.subscribe("run:end", enqueue),
    );
  }

  startReconciliationLoop(): void {
    if (this.disposed || this.reconciliationTimer) return;
    this.reconciliationTimer = setInterval(() => {
      if (this.disposed) return;
      void this.reconcile().catch((error: unknown) => {
        defaultWorkflowLogger.scheduler("task-projector:reconcile:error", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, 10_000);
    this.reconciliationTimer.unref?.();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    for (const unsubscribe of this.unsubscribe.splice(0)) unsubscribe();
    if (this.reconciliationTimer) clearInterval(this.reconciliationTimer);
    this.reconciliationTimer = null;
    await Promise.allSettled(this.runQueues.values());
    await this.reconciliation;
  }

  async projectEvent(event: AgentEvent): Promise<void> {
    if (!isProjectionEvent(event)) return;
    const sequence = await this.checkpointer.saveEvent(event);
    if (sequence === null) return;
    const binding = await executeQuery(
      { db: this.db },
      getWorkflowTaskDispatchByRunId,
      { runId: event.runId },
    );
    if (!binding) return;
    await this.applyEvent(binding, { ...event, sequence });
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
    const bindings = await executeQuery(
      { db: this.db },
      listWorkflowTaskDispatchesForProjection,
      { ownerId: this.ownerId },
    );
    for (const binding of bindings) {
      try {
        await this.reconcileBinding(binding);
      } catch (error: unknown) {
        defaultWorkflowLogger.scheduler("task-projector:reconcile:deferred", {
          dispatchId: binding.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async reconcileBinding(binding: WorkflowTaskDispatch): Promise<void> {
    const events = await this.checkpointer.listEvents(
      binding.runId,
      binding.lastProjectedEventSequence,
    );
    for (const event of events) {
      if (isProjectionEvent(event) && event.sequence !== undefined) {
        await this.applyEvent(binding, event);
      }
    }

    const currentBinding = await executeQuery(
      { db: this.db },
      getWorkflowTaskDispatchByRunId,
      { runId: binding.runId },
    );
    if (!currentBinding) return;
    const metadata = await this.checkpointer.loadRunMetadata(
      currentBinding.runId,
    );
    if (!metadata) return;
    if (currentBinding.status === "CANCELLING") {
      if (metadata.status === "running" || metadata.status === "paused") {
        if (this.scheduler.hasRun(currentBinding.runId))
          await this.scheduler.cancel(currentBinding.runId);
        return;
      }
      if (metadata.status === "cancelled") {
        await this.confirmCancelledDispatch(
          currentBinding,
          currentBinding.lastProjectedEventSequence + 1,
        );
      }
      return;
    }
    if (metadata.status === "running" || metadata.status === "paused") return;
    if (metadata.status === "completed") {
      const snapshot = await this.checkpointer.loadSnapshot(
        currentBinding.runId,
      );
      if (!snapshot) return;
      await this.applyEvent(currentBinding, {
        eventId: crypto.randomUUID(),
        runId: currentBinding.runId,
        type: "run:end",
        timestamp: new Date().toISOString(),
        sequence: currentBinding.lastProjectedEventSequence + 1,
        payload: { status: "completed", blackboard: snapshot.data },
      });
      return;
    }
    if (metadata.status === "cancelled") {
      const cancelled = await executeCommand(
        { db: this.db },
        requestWorkflowTaskDispatchCancel,
        {
          taskId: currentBinding.taskId,
          requestId: crypto.randomUUID(),
        },
      );
      if (cancelled.dispatch?.status === "CANCELLING") {
        await this.confirmCancelledDispatch(
          cancelled.dispatch,
          cancelled.dispatch.lastProjectedEventSequence + 1,
        );
      }
      return;
    }
    const runError = (
      await this.checkpointer.listEvents(currentBinding.runId)
    ).findLast((event) => event.type === "run:error");
    const typedFailure =
      runError?.type === "run:error"
        ? runError.payload.operationFailure
        : undefined;
    const task = await executeQuery(
      { db: this.db },
      getLocalizationTaskForWorkflow,
      { taskId: currentBinding.taskId },
    );
    if (!task) return;
    await executeCommand({ db: this.db }, projectWorkflowTaskDispatchEvent, {
      runId: currentBinding.runId,
      eventId: crypto.randomUUID(),
      sequence: currentBinding.lastProjectedEventSequence + 1,
      action:
        typedFailure?.capability === "LANGUAGE_ANALYSIS" &&
        typedFailure.blocker !== undefined
          ? "block"
          : "fail",
      failure: typedFailure
        ? { ...typedFailure, affectedResources: task.state.resources }
        : {
            code: "CAT_OPERATION_FAILED",
            message: "Workflow execution was interrupted by process recovery.",
            severity: "ERROR",
            retryable: true,
            affectedResources: task.state.resources,
            redactionBoundary: "INTERNAL",
          },
    });
  }

  private enqueue(event: AgentEvent): Promise<void> {
    const previous = this.runQueues.get(event.runId) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            await this.projectEvent(event);
            return;
          } catch (error) {
            lastError = error;
          }
        }
        throw lastError;
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
    binding: WorkflowTaskDispatch,
    event: AgentEvent & { sequence?: number | undefined },
  ): Promise<void> {
    if (event.sequence === undefined) return;
    if (event.sequence <= binding.lastProjectedEventSequence) return;
    if (event.type === "workflow:task:progress") {
      await executeCommand({ db: this.db }, projectWorkflowTaskDispatchEvent, {
        runId: binding.runId,
        eventId: event.eventId,
        sequence: event.sequence,
        action: "progress",
        current: event.payload.current,
        total: event.payload.total,
        phase: event.payload.phase,
      });
      return;
    }
    if (event.type !== "run:end") return;
    if (event.payload.status === "completed") {
      const blackboard = JSONObjectSchema.parse(event.payload.blackboard);
      await executeCommand({ db: this.db }, projectWorkflowTaskDispatchEvent, {
        runId: binding.runId,
        eventId: event.eventId,
        sequence: event.sequence,
        action: "complete",
        result: batchAutoTranslateGraph.extractResult({ data: blackboard }),
      });
      return;
    }
    if (event.payload.status === "cancelled") {
      const cancelled = await executeCommand(
        { db: this.db },
        requestWorkflowTaskDispatchCancel,
        {
          taskId: binding.taskId,
          requestId: event.eventId,
        },
      );
      if (cancelled.dispatch?.status === "CANCELLING") {
        await this.confirmCancelledDispatch(cancelled.dispatch, event.sequence);
      }
      return;
    }
    const runError = (
      await this.checkpointer.listEvents(binding.runId)
    ).findLast((candidate) => candidate.type === "run:error");
    const typedFailure =
      runError?.type === "run:error"
        ? runError.payload.operationFailure
        : undefined;
    const task = await executeQuery(
      { db: this.db },
      getLocalizationTaskForWorkflow,
      { taskId: binding.taskId },
    );
    if (!task) return;
    await executeCommand({ db: this.db }, projectWorkflowTaskDispatchEvent, {
      runId: binding.runId,
      eventId: event.eventId,
      sequence: event.sequence,
      action:
        typedFailure?.capability === "LANGUAGE_ANALYSIS" &&
        typedFailure.blocker !== undefined
          ? "block"
          : "fail",
      failure: typedFailure
        ? { ...typedFailure, affectedResources: task.state.resources }
        : {
            code: "CAT_OPERATION_FAILED",
            message:
              runError?.type === "run:error"
                ? runError.payload.error
                : "Workflow execution failed.",
            severity: "ERROR",
            retryable: true,
            affectedResources: task.state.resources,
            redactionBoundary: "INTERNAL",
          },
    });
  }

  private async confirmCancelledDispatch(
    binding: WorkflowTaskDispatch,
    sequence: number,
  ): Promise<void> {
    const metadata = await this.checkpointer.loadRunMetadata(binding.runId);
    const runFence = this.runFenceFromMetadata(binding.runId, metadata);
    const dispatchFence = this.dispatchFenceFor(binding);
    if (dispatchFence.ownerId !== this.ownerId) {
      throw new Error("Workflow task cancellation owner fence is unavailable.");
    }
    await executeCommand({ db: this.db }, projectWorkflowTaskDispatchEvent, {
      runId: binding.runId,
      eventId: crypto.randomUUID(),
      sequence,
      action: "confirmCancel",
      dispatchFence,
      runFence: { ownerId: runFence.ownerId, epoch: runFence.epoch },
    });
  }

  private dispatchFenceFor = (binding: WorkflowTaskDispatch) => {
    if (!binding.ownerId) {
      throw new Error("Workflow task dispatch owner fence is unavailable.");
    }
    return { ownerId: binding.ownerId, epoch: binding.ownerEpoch };
  };

  private runFenceFromMetadata = (
    runId: string,
    metadata: RunMetadata | null,
  ): RunOwnershipFence => {
    if (!metadata?.ownerId || metadata.ownerEpoch === undefined) {
      throw new Error("Workflow task AgentRun owner fence is unavailable.");
    }
    return { runId, ownerId: metadata.ownerId, epoch: metadata.ownerEpoch };
  };
}
