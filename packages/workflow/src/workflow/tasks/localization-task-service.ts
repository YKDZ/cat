import { randomUUID } from "node:crypto";

import {
  createAgentDefinition,
  createAgentSession,
  executeCommand,
  executeQuery,
  findAgentDefinitionByNameAndScope,
  getAgentSessionByExternalId,
  listLocalizationTasksForWorkflow,
  retryLocalizationTask,
  TaskDispatchClaimConflictError,
  type DbHandle,
  type LocalizationTaskSummary,
} from "@cat/domain";
import type { PluginManager } from "@cat/plugin-core";
import {
  BatchAutoTranslationInvocationSchema,
  JSONObjectSchema,
} from "@cat/shared";

import {
  type Scheduler,
  WorkflowRunOwnershipConflictError,
} from "#/graph/scheduler.ts";
import { defaultWorkflowLogger } from "#/graph/workflow-logger.ts";

import { BatchAutoTranslationTaskAdapter } from "./batch-auto-translation-task-adapter.ts";

const DISPATCH_CLAIM_MS = 30_000;

type TaskRuntimeDependencies = {
  scheduler: Scheduler;
};

export class LocalizationTaskService {
  private readonly db: DbHandle;
  private readonly pluginManager: PluginManager;
  private readonly runtime: TaskRuntimeDependencies;
  private reconciliationTimer: ReturnType<typeof setInterval> | null = null;
  private reconciliation: Promise<void> | null = null;

  constructor(input: {
    db: DbHandle;
    pluginManager: PluginManager;
    runtime: TaskRuntimeDependencies;
  }) {
    this.db = input.db;
    this.pluginManager = input.pluginManager;
    this.runtime = input.runtime;
  }

  startReconciliationLoop(): void {
    if (this.reconciliationTimer) return;
    this.reconciliationTimer = setInterval(() => {
      void this.reconcilePending();
    }, 5_000);
    this.reconciliationTimer.unref?.();
  }

  async dispose(): Promise<void> {
    if (this.reconciliationTimer) clearInterval(this.reconciliationTimer);
    this.reconciliationTimer = null;
    if (this.reconciliation) await this.reconciliation;
  }

  async createAndSchedule(input: {
    invocation: unknown;
    actorId: string;
  }): Promise<LocalizationTaskSummary> {
    const invocation = BatchAutoTranslationInvocationSchema.parse(
      input.invocation,
    );
    const adapter = await BatchAutoTranslationTaskAdapter.create({
      db: this.db,
      invocation,
      actorId: input.actorId,
    });
    return await this.dispatch(adapter);
  }

  async retryAndSchedule(input: {
    taskId: string;
    actorId: string;
  }): Promise<LocalizationTaskSummary> {
    const task = await executeCommand({ db: this.db }, retryLocalizationTask, {
      taskId: input.taskId,
      actor: { type: "USER", id: input.actorId },
    });
    const adapter = await BatchAutoTranslationTaskAdapter.hydrate(
      this.db,
      task.id,
    );
    if (
      adapter.task.state.status === "COMPLETED" ||
      adapter.task.state.status === "FAILED" ||
      adapter.task.state.status === "CANCELED"
    ) {
      return adapter.task;
    }
    try {
      return await this.dispatchClosedKind(adapter);
    } catch (error) {
      if (error instanceof TaskDispatchClaimConflictError) {
        return await adapter.refresh();
      }
      throw error;
    }
  }

  async resumeAndSchedule(input: {
    taskId: string;
    requestId: string;
  }): Promise<LocalizationTaskSummary> {
    const adapter = await BatchAutoTranslationTaskAdapter.hydrate(
      this.db,
      input.taskId,
    );
    await adapter.resume({ requestId: input.requestId });
    return await this.dispatchClosedKind(adapter);
  }

  async reconcilePending(): Promise<void> {
    if (this.reconciliation) return await this.reconciliation;
    this.reconciliation = this.reconcilePendingTasks();
    try {
      await this.reconciliation;
    } finally {
      this.reconciliation = null;
    }
  }

  private async reconcilePendingTasks(): Promise<void> {
    const tasks = await executeQuery(
      { db: this.db },
      listLocalizationTasksForWorkflow,
      {},
    );
    for (const task of tasks) {
      if (task.state.actor.type !== "USER") continue;
      const runId = task.state.runtime.runId;
      const adapter = await BatchAutoTranslationTaskAdapter.hydrate(
        this.db,
        task.id,
      );
      try {
        if (!runId) {
          if (task.state.status === "PENDING") {
            // oxlint-disable-next-line no-await-in-loop
            await this.dispatchClosedKind(adapter);
            continue;
          }
          if (task.state.status !== "CANCEL_REQUESTED") continue;
          const orphan =
            await this.runtime.scheduler.checkpointer.findRunByDeduplicationKey(
              `localization-task:${task.id}`,
            );
          if (
            !orphan ||
            (orphan.status !== "running" && orphan.status !== "paused")
          ) {
            continue;
          }
          const claimId = adapter.task.state.runtime.dispatchClaimId;
          if (claimId) {
            // The task row lock verifies this is still the matching live claim
            // before binding the allocation identified by this task's unique
            // deduplication key. Keep CANCEL_REQUESTED so recovery cannot start
            // user work before scheduler cancellation is persisted.
            try {
              // oxlint-disable-next-line no-await-in-loop
              await adapter.bindRun(orphan.runId, claimId);
            } catch (error) {
              // An expired claim cannot bind, but this unique orphan still must
              // be cancelled before the DB can later confirm the Task.
              if (!(error instanceof TaskDispatchClaimConflictError))
                throw error;
            }
          }
          if (!this.runtime.scheduler.hasRun(orphan.runId)) {
            // oxlint-disable-next-line no-await-in-loop
            await this.runtime.scheduler.recover(orphan.runId, {
              runtime: { pluginManager: this.pluginManager },
              cancelRequested: true,
            });
          }
          // oxlint-disable-next-line no-await-in-loop
          await this.runtime.scheduler.cancel(orphan.runId);
          continue;
        }

        const metadata =
          await this.runtime.scheduler.checkpointer.loadRunMetadata(runId);
        if (metadata?.status !== "running" && metadata?.status !== "paused") {
          continue;
        }
        if (!this.runtime.scheduler.hasRun(runId)) {
          if (adapter.task.state.status === "PENDING") {
            // A pre-atomic deployment may have persisted a bound run before its
            // Task start. Repair that order before recovery can dispatch nodes.
            // oxlint-disable-next-line no-await-in-loop
            await adapter.start("PREPARING");
          }
          // oxlint-disable-next-line no-await-in-loop
          await this.runtime.scheduler.recover(runId, {
            runtime: { pluginManager: this.pluginManager },
            cancelRequested: adapter.task.state.status === "CANCEL_REQUESTED",
          });
        }
        await adapter.refresh();
        if (adapter.task.state.status === "CANCEL_REQUESTED") {
          // oxlint-disable-next-line no-await-in-loop
          await this.runtime.scheduler.cancel(runId);
        }
      } catch (error) {
        if (this.isDeferredDispatchError(error)) continue;
        defaultWorkflowLogger.scheduler("task-dispatch:deferred", {
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async dispatchClosedKind(
    adapter: BatchAutoTranslationTaskAdapter,
  ): Promise<LocalizationTaskSummary> {
    switch (adapter.task.task.kind) {
      case "BATCH_AUTO_TRANSLATION":
        return await this.dispatch(adapter);
      default:
        throw new Error("Unsupported localization task kind.");
    }
  }

  private async dispatch(
    adapter: BatchAutoTranslationTaskAdapter,
  ): Promise<LocalizationTaskSummary> {
    const task = adapter.task;
    if (task.state.actor.type !== "USER") {
      throw new Error("Batch auto-translation requires a user actor.");
    }
    if (task.state.runtime.runId !== null) return await adapter.refresh();
    try {
      const claimId = randomUUID();
      await adapter.claimDispatch(claimId, DISPATCH_CLAIM_MS);
      const sessionId = await this.resolveAgentSession(task);
      const invocation = task.task.payload.invocation;
      const graphInput = JSONObjectSchema.parse(invocation);
      const runId = await this.runtime.scheduler.start(
        "batch-auto-translate",
        graphInput,
        {
          sessionId,
          pluginManager: this.pluginManager,
          deduplicationKey: `localization-task:${task.id}`,
          metadata: { localizationTaskId: task.id },
          onRunCreated: async (createdRunId) => {
            await adapter.bindRunAndStart(createdRunId, claimId, "PREPARING");
          },
        },
      );

      await adapter.refresh();
      if (adapter.task.state.status === "CANCEL_REQUESTED") {
        await this.runtime.scheduler.cancel(runId);
      }
      return await adapter.refresh();
    } catch (error) {
      if (this.isDeferredDispatchError(error)) return await adapter.refresh();
      await adapter.refresh();
      if (
        adapter.task.state.status !== "FAILED" &&
        adapter.task.state.status !== "CANCELED" &&
        adapter.task.state.status !== "COMPLETED" &&
        adapter.task.state.status !== "CANCEL_REQUESTED"
      ) {
        await adapter.fail({
          code: "CAT_OPERATION_FAILED",
          message: "Batch auto-translation could not be scheduled.",
          severity: "ERROR",
          retryable: true,
          affectedResources: adapter.task.state.resources,
          remediationHint: "Retry after the workflow scheduler is available.",
          redactionBoundary: "INTERNAL",
        });
      }
      throw error;
    }
  }

  private isDeferredDispatchError(error: unknown): boolean {
    return (
      error instanceof TaskDispatchClaimConflictError ||
      error instanceof WorkflowRunOwnershipConflictError
    );
  }

  private async createAgentSession(
    task: LocalizationTaskSummary,
  ): Promise<number> {
    const actorId = task.state.actor.id;
    if (!actorId) throw new Error("Task user actor is missing.");

    let definition = await executeQuery(
      { db: this.db },
      findAgentDefinitionByNameAndScope,
      {
        name: "auto-translate",
        scopeType: "GLOBAL",
        scopeId: "",
        isBuiltin: true,
      },
    );
    if (!definition) {
      await executeCommand({ db: this.db }, createAgentDefinition, {
        name: "auto-translate",
        description: "Batch auto-translation workflow",
        scopeType: "GLOBAL",
        scopeId: "",
        definitionId: "auto-translate",
        version: "1.0.0",
        type: "WORKFLOW",
        tools: [],
        content: "",
        isBuiltin: true,
      });
      definition = await executeQuery(
        { db: this.db },
        findAgentDefinitionByNameAndScope,
        {
          name: "auto-translate",
          scopeType: "GLOBAL",
          scopeId: "",
          isBuiltin: true,
        },
      );
    }
    if (!definition)
      throw new Error("Auto-translate agent definition missing.");

    const invocation = task.task.payload.invocation;
    const session = await executeCommand({ db: this.db }, createAgentSession, {
      agentDefinitionId: definition.externalId,
      userId: actorId,
      projectId: invocation.projectId,
      metadata: {
        localizationTaskId: task.id,
        projectId: invocation.projectId,
        languageId: invocation.languageId,
        contentNodeIds: invocation.contentNodeIds,
        elementIds: invocation.elementIds,
        sortMode: invocation.sortMode,
      },
    });
    const row = await executeQuery(
      { db: this.db },
      getAgentSessionByExternalId,
      { externalId: session.sessionId },
    );
    if (!row)
      throw new Error("Failed to resolve auto-translate agent session.");
    return row.id;
  }

  private async resolveAgentSession(
    task: LocalizationTaskSummary,
  ): Promise<number> {
    const runId = task.state.runtime.runId;
    if (runId) {
      const metadata =
        await this.runtime.scheduler.checkpointer.loadRunMetadata(runId);
      const sessionId = metadata?.metadata?.["sessionId"];
      if (typeof sessionId === "number") return sessionId;
    }
    return await this.createAgentSession(task);
  }
}
