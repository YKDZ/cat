import { randomUUID } from "node:crypto";

import {
  activateWorkflowTaskDispatch,
  acquireWorkflowTaskDispatchRunOwnership,
  bindWorkflowTaskDispatchSession,
  claimWorkflowTaskDispatch,
  createAgentDefinition,
  createAgentSession,
  executeCommand,
  executeQuery,
  findAgentDefinitionByNameAndScope,
  getLocalizationTaskForWorkflow,
  listLiveWorkflowTaskDispatchesOwnedBy,
  retryWorkflowTaskWithDispatch,
  requestWorkflowTaskDispatchCancel,
  renewWorkflowTaskDispatch,
  resumeWorkflowTaskWithDispatch,
  projectWorkflowTaskDispatchEvent,
  type DbHandle,
  type LocalizationTaskSummary,
  type WorkflowTaskDispatch,
} from "@cat/domain";
import type { PluginManager } from "@cat/plugin-core";
import {
  BatchAutoTranslationInvocationSchema,
  JSONObjectSchema,
} from "@cat/shared";

import type {
  CreateOrClaimRunOwnershipInput,
  RunMetadata,
  RunOwnershipClaim,
  RunOwnershipFence,
} from "#/graph/checkpointer/types.ts";
import type { Scheduler } from "#/graph/scheduler.ts";
import { defaultWorkflowLogger } from "#/graph/workflow-logger.ts";

import { BatchAutoTranslationTaskAdapter } from "./batch-auto-translation-task-adapter.ts";

const DISPATCH_LEASE_MS = 30_000;
const DISPATCH_HEARTBEAT_MS = 5_000;

export class LocalizationTaskService {
  private readonly db: DbHandle;
  private readonly pluginManager: PluginManager;
  private readonly scheduler: Scheduler;
  private readonly ownerId: string;
  private readonly ownedDispatchEpochs = new Map<string, number>();
  private reconciliationTimer: ReturnType<typeof setInterval> | null = null;
  private reconciliation: Promise<void> | null = null;
  private disposed = false;

  constructor(input: {
    db: DbHandle;
    pluginManager: PluginManager;
    runtime: { scheduler: Scheduler };
    ownerId?: string;
  }) {
    this.db = input.db;
    this.pluginManager = input.pluginManager;
    this.scheduler = input.runtime.scheduler;
    this.ownerId = input.ownerId ?? randomUUID();
  }

  startReconciliationLoop(): void {
    if (this.disposed || this.reconciliationTimer) return;
    this.reconciliationTimer = setInterval(() => {
      if (this.disposed) return;
      void this.heartbeatAndReconcile().catch((error: unknown) => {
        defaultWorkflowLogger.scheduler("task-dispatch:reconcile:error", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, DISPATCH_HEARTBEAT_MS);
    this.reconciliationTimer.unref?.();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.reconciliationTimer) clearInterval(this.reconciliationTimer);
    this.reconciliationTimer = null;
    await this.reconciliation;
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
    await this.reconcilePending();
    return await adapter.refresh();
  }

  async retryAndSchedule(input: {
    taskId: string;
    actorId: string;
  }): Promise<LocalizationTaskSummary> {
    const result = await executeCommand(
      { db: this.db },
      retryWorkflowTaskWithDispatch,
      input,
    );
    await this.reconcilePending();
    return (
      (await executeQuery({ db: this.db }, getLocalizationTaskForWorkflow, {
        taskId: result.task.id,
      })) ?? result.task
    );
  }

  async resumeAndSchedule(input: {
    taskId: string;
    requestId: string;
  }): Promise<LocalizationTaskSummary> {
    const result = await executeCommand(
      { db: this.db },
      resumeWorkflowTaskWithDispatch,
      input,
    );
    await this.reconcilePending();
    return (
      (await executeQuery({ db: this.db }, getLocalizationTaskForWorkflow, {
        taskId: result.task.id,
      })) ?? result.task
    );
  }

  async requestCancel(input: {
    taskId: string;
    requestId: string;
  }): Promise<LocalizationTaskSummary> {
    const result = await executeCommand(
      { db: this.db },
      requestWorkflowTaskDispatchCancel,
      input,
    );
    if (result.dispatch?.status === "CANCELLING") {
      await this.cancelOwnedDispatch(result.dispatch);
    }
    await this.reconcilePending();
    return (
      (await executeQuery({ db: this.db }, getLocalizationTaskForWorkflow, {
        taskId: result.task.id,
      })) ?? result.task
    );
  }

  async reconcilePending(): Promise<void> {
    await this.reconcileRound(false);
  }

  private async heartbeatAndReconcile(): Promise<void> {
    await this.reconcileRound(true);
  }

  private async reconcileRound(renewOwnedDispatches: boolean): Promise<void> {
    if (this.disposed) return;
    if (this.reconciliation) return await this.reconciliation;
    const round = Promise.resolve().then(async () => {
      if (this.disposed) return;
      if (renewOwnedDispatches) {
        await this.renewOwnedDispatches();
        if (this.disposed) return;
      }
      await this.reconcileDispatches();
    });
    this.reconciliation = round;
    try {
      await round;
    } finally {
      if (this.reconciliation === round) this.reconciliation = null;
    }
  }

  private async renewOwnedDispatches(): Promise<void> {
    const owned = [...this.ownedDispatchEpochs.entries()];
    for (const [dispatchId, ownerEpoch] of owned) {
      if (this.disposed) return;
      // oxlint-disable-next-line no-await-in-loop
      const renewed = await executeCommand(
        { db: this.db },
        renewWorkflowTaskDispatch,
        {
          dispatchId,
          ownerId: this.ownerId,
          ownerEpoch,
          leaseDurationMs: DISPATCH_LEASE_MS,
        },
      );
      if (!renewed) this.ownedDispatchEpochs.delete(dispatchId);
      if (this.disposed) return;
    }
  }

  private dispatchFenceFor = (binding: WorkflowTaskDispatch) => {
    if (!binding.ownerId) {
      throw new Error("Workflow task dispatch owner fence is unavailable.");
    }
    return { ownerId: binding.ownerId, epoch: binding.ownerEpoch };
  };

  private runFenceFromMetadata = (
    runId: string,
    metadata: RunMetadata,
  ): RunOwnershipFence => {
    if (!metadata.ownerId || metadata.ownerEpoch === undefined) {
      throw new Error("Workflow task AgentRun owner fence is unavailable.");
    }
    return { runId, ownerId: metadata.ownerId, epoch: metadata.ownerEpoch };
  };

  private loadRunFence = async (runId: string): Promise<RunOwnershipFence> => {
    const metadata = await this.scheduler.checkpointer.loadRunMetadata(runId);
    if (!metadata)
      throw new Error("Workflow task AgentRun metadata is missing.");
    return this.runFenceFromMetadata(runId, metadata);
  };

  private acquireRunOwnership = async (
    binding: WorkflowTaskDispatch,
    input: CreateOrClaimRunOwnershipInput,
  ): Promise<RunOwnershipClaim> => {
    if (input.sessionId === undefined) {
      throw new Error("Workflow task AgentRun session is required.");
    }
    const acquired = await executeCommand(
      { db: this.db },
      acquireWorkflowTaskDispatchRunOwnership,
      {
        dispatchId: binding.id,
        ownerId: this.ownerId,
        ownerEpoch: binding.ownerEpoch,
        leaseDurationMs: DISPATCH_LEASE_MS,
        agentRun: {
          externalId: input.runId,
          sessionId: input.sessionId,
          status: "running",
          graphDefinition: input.graphDefinition,
          currentNodeId: null,
          deduplicationKey: input.deduplicationKey ?? null,
          startedAt: new Date(input.startedAt),
          metadata: input.metadata ?? null,
        },
      },
    );
    if (acquired === null) return { kind: "conflict", runId: input.runId };
    if (acquired.kind === "dispatch-identity-conflict") {
      return {
        kind: "identity-conflict",
        externalIdRunId: acquired.expectedRunId,
        deduplicationKeyRunId: acquired.actualRunId,
      };
    }
    if (acquired.kind !== "claimed") return acquired;
    const metadata = await this.scheduler.checkpointer.loadRunMetadata(
      acquired.runId,
    );
    if (!metadata) {
      throw new Error(
        "Workflow task AgentRun metadata is missing after claim.",
      );
    }
    return {
      kind: "claimed",
      created: acquired.created,
      metadata,
      ownershipFence: {
        runId: acquired.runId,
        ownerId: acquired.ownerId,
        epoch: acquired.epoch,
      },
    };
  };

  private acquisitionFor = (binding: WorkflowTaskDispatch) => {
    return async (input: CreateOrClaimRunOwnershipInput) =>
      await this.acquireRunOwnership(binding, input);
  };

  private recoverOwnedRun = async (
    binding: WorkflowTaskDispatch,
    metadata: RunMetadata,
    onRunActivated: (runId: string) => Promise<boolean>,
  ): Promise<void> => {
    if (binding.agentSessionId === null || !metadata.graphDefinition) {
      throw new Error(
        "Workflow task AgentRun recovery metadata is incomplete.",
      );
    }
    const ownership = await this.acquireRunOwnership(binding, {
      runId: binding.runId,
      sessionId: binding.agentSessionId,
      graphId: metadata.graphId,
      graphDefinition: metadata.graphDefinition,
      deduplicationKey: metadata.deduplicationKey,
      metadata: metadata.metadata,
      startedAt: metadata.startedAt,
    });
    if (ownership.kind === "conflict") return;
    if (ownership.kind === "identity-conflict") {
      throw new Error(
        "Workflow task AgentRun identities conflict during recovery.",
      );
    }
    await this.scheduler.recover(binding.runId, {
      runtime: this.runtimeFor(binding),
      ownershipFence: ownership.ownershipFence,
      onRunActivated,
    });
  };

  private renewOwnedRunDispatch = async (
    binding: WorkflowTaskDispatch,
    runFence: RunOwnershipFence,
  ): Promise<void> => {
    const dispatchFence = this.dispatchFenceFor(binding);
    if (
      dispatchFence.ownerId !== this.ownerId ||
      runFence.ownerId !== this.ownerId
    ) {
      throw new Error("Workflow task dispatch is not owned by this runtime.");
    }
    const localFence = this.scheduler.checkpointer.getRunOwnershipFence(
      binding.runId,
    );
    if (
      !localFence ||
      localFence.ownerId !== runFence.ownerId ||
      localFence.epoch !== runFence.epoch
    ) {
      throw new Error("Workflow task AgentRun owner fence is unavailable.");
    }
    const runRenewed = await this.scheduler.checkpointer.renewRunOwnership(
      binding.runId,
    );
    const dispatchRenewed = await executeCommand(
      { db: this.db },
      renewWorkflowTaskDispatch,
      {
        dispatchId: binding.id,
        ownerId: dispatchFence.ownerId,
        ownerEpoch: dispatchFence.epoch,
        leaseDurationMs: DISPATCH_LEASE_MS,
      },
    );
    if (!runRenewed || !dispatchRenewed) {
      this.ownedDispatchEpochs.delete(binding.id);
      throw new Error("Workflow task dispatch ownership lost.");
    }
  };

  private runtimeFor = (binding: WorkflowTaskDispatch) => ({
    pluginManager: this.pluginManager,
    assertRunOwnership: async () => {
      await this.renewOwnedRunDispatch(
        binding,
        await this.loadRunFence(binding.runId),
      );
    },
  });

  private async reconcileDispatches(): Promise<void> {
    if (this.disposed) return;
    const ownedBindings = await executeQuery(
      { db: this.db },
      listLiveWorkflowTaskDispatchesOwnedBy,
      { ownerId: this.ownerId },
    );
    for (const binding of ownedBindings) {
      if (this.disposed) return;
      try {
        // oxlint-disable-next-line no-await-in-loop
        await this.dispatch(binding);
      } catch (error) {
        defaultWorkflowLogger.scheduler("task-dispatch:deferred", {
          dispatchId: binding.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    for (;;) {
      if (this.disposed) return;
      const binding = await executeCommand(
        { db: this.db },
        claimWorkflowTaskDispatch,
        {
          ownerId: this.ownerId,
          leaseDurationMs: DISPATCH_LEASE_MS,
        },
      );
      if (!binding) return;
      if (this.disposed) return;
      this.ownedDispatchEpochs.set(binding.id, binding.ownerEpoch);
      try {
        // oxlint-disable-next-line no-await-in-loop
        await this.dispatch(binding);
      } catch (error) {
        defaultWorkflowLogger.scheduler("task-dispatch:deferred", {
          dispatchId: binding.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async dispatch(binding: WorkflowTaskDispatch): Promise<void> {
    if (binding.status === "CANCELLING") {
      const metadata = await this.scheduler.checkpointer.loadRunMetadata(
        binding.runId,
      );
      if (
        metadata &&
        (metadata.status === "running" || metadata.status === "paused")
      ) {
        if (!this.scheduler.hasRun(binding.runId)) {
          await this.recoverOwnedRun(
            binding,
            metadata,
            async (runId) =>
              await this.activateOwnedDispatch(
                binding,
                await this.loadRunFence(runId),
              ),
          );
        }
        if (this.scheduler.hasRun(binding.runId)) {
          await this.scheduler.cancel(binding.runId);
        }
      }
      const afterRecovery = await this.scheduler.checkpointer.loadRunMetadata(
        binding.runId,
      );
      if (afterRecovery?.status === "cancelled") {
        await this.confirmCancelledDispatch(binding);
      }
      return;
    }
    if (binding.status === "RUNNING") {
      if (!this.scheduler.hasRun(binding.runId)) {
        const metadata = await this.scheduler.checkpointer.loadRunMetadata(
          binding.runId,
        );
        if (metadata) {
          await this.recoverOwnedRun(
            binding,
            metadata,
            async (runId) =>
              await this.activateOwnedDispatch(
                binding,
                await this.loadRunFence(runId),
              ),
          );
        }
      }
      const recovered = await this.scheduler.checkpointer.loadRunMetadata(
        binding.runId,
      );
      if (recovered?.status === "cancelled") {
        await this.confirmCancelledDispatch(binding);
      }
      return;
    }
    const task = await executeQuery(
      { db: this.db },
      getLocalizationTaskForWorkflow,
      { taskId: binding.taskId },
    );
    if (!task) return;
    const sessionId =
      binding.agentSessionId ?? (await this.createAgentSession(task));
    const owned = await executeCommand(
      { db: this.db },
      bindWorkflowTaskDispatchSession,
      {
        dispatchId: binding.id,
        ownerId: this.ownerId,
        ownerEpoch: binding.ownerEpoch,
        agentSessionId: sessionId,
      },
    );
    const input = JSONObjectSchema.parse(task.task.payload.invocation);
    await this.scheduler.start("batch-auto-translate", input, {
      preallocatedRunId: owned.runId,
      sessionId,
      pluginManager: this.pluginManager,
      deduplicationKey: `workflow-task-dispatch:${owned.id}`,
      metadata: { localizationTaskDispatchId: owned.id },
      onRunActivated: async (runId) => {
        return await this.activateOwnedDispatch(
          owned,
          await this.loadRunFence(runId),
        );
      },
      assertRunOwnership: async () => {
        await this.renewOwnedRunDispatch(
          owned,
          await this.loadRunFence(owned.runId),
        );
      },
      acquireRunOwnership: this.acquisitionFor(owned),
    });
    const metadata = await this.scheduler.checkpointer.loadRunMetadata(
      owned.runId,
    );
    if (metadata?.status === "cancelled") {
      await this.confirmCancelledDispatch(owned);
    }
  }

  private async activateOwnedDispatch(
    binding: WorkflowTaskDispatch,
    runFence: RunOwnershipFence,
  ): Promise<boolean> {
    const activated = await executeCommand(
      { db: this.db },
      activateWorkflowTaskDispatch,
      {
        dispatchId: binding.id,
        dispatchFence: this.dispatchFenceFor(binding),
        runFence: { ownerId: runFence.ownerId, epoch: runFence.epoch },
        requestId: randomUUID(),
      },
    );
    return !activated.cancelled;
  }

  private async confirmCancelledDispatch(
    binding: WorkflowTaskDispatch,
  ): Promise<void> {
    const runFence = await this.loadRunFence(binding.runId);
    const dispatchFence = this.dispatchFenceFor(binding);
    if (dispatchFence.ownerId !== this.ownerId) {
      throw new Error("Workflow task cancellation owner fence is unavailable.");
    }
    await executeCommand({ db: this.db }, projectWorkflowTaskDispatchEvent, {
      runId: binding.runId,
      eventId: randomUUID(),
      sequence: binding.lastProjectedEventSequence + 1,
      action: "confirmCancel",
      dispatchFence,
      runFence: { ownerId: runFence.ownerId, epoch: runFence.epoch },
    });
  }

  private async cancelOwnedDispatch(
    binding: WorkflowTaskDispatch,
  ): Promise<void> {
    const dispatchFence = this.dispatchFenceFor(binding);
    if (dispatchFence.ownerId !== this.ownerId) return;
    const dispatchLive = await executeCommand(
      { db: this.db },
      renewWorkflowTaskDispatch,
      {
        dispatchId: binding.id,
        ownerId: dispatchFence.ownerId,
        ownerEpoch: dispatchFence.epoch,
        leaseDurationMs: DISPATCH_LEASE_MS,
      },
    );
    if (!dispatchLive) return;

    const metadata = await this.scheduler.checkpointer.loadRunMetadata(
      binding.runId,
    );
    if (!metadata) return;
    const runFence = this.runFenceFromMetadata(binding.runId, metadata);
    if (runFence.ownerId !== this.ownerId) return;

    if (metadata.status === "running" || metadata.status === "paused") {
      if (!this.scheduler.hasRun(binding.runId)) {
        await this.recoverOwnedRun(
          binding,
          metadata,
          async (runId) =>
            await this.activateOwnedDispatch(
              binding,
              await this.loadRunFence(runId),
            ),
        );
      }
      if (this.scheduler.hasRun(binding.runId)) {
        await this.scheduler.cancel(binding.runId);
      }
    }
    const terminal = await this.scheduler.checkpointer.loadRunMetadata(
      binding.runId,
    );
    if (terminal?.status === "cancelled") {
      await this.confirmCancelledDispatch(binding);
    }
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
    const { getAgentSessionByExternalId } = await import("@cat/domain");
    const row = await executeQuery(
      { db: this.db },
      getAgentSessionByExternalId,
      { externalId: session.sessionId },
    );
    if (!row)
      throw new Error("Failed to resolve auto-translate agent session.");
    return row.id;
  }
}
