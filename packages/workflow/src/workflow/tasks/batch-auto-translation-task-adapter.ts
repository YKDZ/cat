import { randomUUID } from "node:crypto";

import {
  createLocalizationTask,
  executeCommand,
  executeQuery,
  getLocalizationTaskForWorkflow,
  transitionLocalizationTask,
  TaskRevisionConflictError,
  type DbHandle,
  type LocalizationTaskSummary,
} from "@cat/domain";
import type {
  BatchAutoTranslationInvocation,
  BatchAutoTranslationTaskPhase,
  BatchAutoTranslationTaskResult,
  OperationFailureInput,
} from "@cat/shared";

type TransitionPayload<T> = T extends unknown
  ? Omit<T, "taskId" | "expectedRevision">
  : never;
type TaskTransitionPayload = TransitionPayload<
  Parameters<typeof transitionLocalizationTask>[1]
>;
type TransitionOptions = {
  requestId?: string;
  projectionEventId?: string;
  projectionEventSequence?: number;
  expectedRunId?: string;
};

const terminalStatuses = new Set(["COMPLETED", "FAILED", "CANCELED"]);

/** The workflow-owned, CAS-reconciled projection into the durable Task ledger. */
export class BatchAutoTranslationTaskAdapter {
  #task: LocalizationTaskSummary;
  private readonly db: DbHandle;

  private constructor(db: DbHandle, task: LocalizationTaskSummary) {
    this.db = db;
    this.#task = task;
  }

  static async create(input: {
    db: DbHandle;
    invocation: BatchAutoTranslationInvocation;
    actorId: string;
  }): Promise<BatchAutoTranslationTaskAdapter> {
    const { invocation } = input;
    const created = await executeCommand(
      { db: input.db },
      createLocalizationTask,
      {
        task: {
          kind: "BATCH_AUTO_TRANSLATION",
          payload: { invocation, cancelable: true },
        },
        scope: { type: "PROJECT", id: invocation.projectId },
        actor: { type: "USER", id: input.actorId },
        resources: [{ type: "PROJECT", id: invocation.projectId }],
      },
    );

    return new BatchAutoTranslationTaskAdapter(input.db, created);
  }

  static async hydrate(
    db: DbHandle,
    taskId: string,
  ): Promise<BatchAutoTranslationTaskAdapter> {
    const task = await executeQuery({ db }, getLocalizationTaskForWorkflow, {
      taskId,
    });
    if (!task) throw new Error(`Task ${taskId} no longer exists.`);
    return new BatchAutoTranslationTaskAdapter(db, task);
  }

  get task(): LocalizationTaskSummary {
    return this.#task;
  }

  async refresh(): Promise<LocalizationTaskSummary> {
    const refreshed = await executeQuery(
      { db: this.db },
      getLocalizationTaskForWorkflow,
      { taskId: this.#task.id },
    );
    if (!refreshed) throw new Error(`Task ${this.#task.id} no longer exists.`);
    this.#task = refreshed;
    return refreshed;
  }

  async claimDispatch(
    claimId: string,
    leaseDurationMs: number,
    options?: TransitionOptions,
  ): Promise<void> {
    await this.transition({
      transition: "claimDispatch",
      claimId,
      leaseDurationMs,
      ...this.transitionIdentity(options),
    });
  }

  async start(
    phase: BatchAutoTranslationTaskPhase,
    options?: TransitionOptions,
  ): Promise<void> {
    await this.transition({
      transition: "start",
      phase,
      ...this.transitionIdentity(options),
    });
  }

  async bindRun(
    runId: string,
    claimId: string,
    options?: TransitionOptions,
  ): Promise<void> {
    await this.transition({
      transition: "bindRun",
      runId,
      claimId,
      ...this.transitionIdentity(options),
    });
  }

  async bindRunAndStart(
    runId: string,
    claimId: string,
    phase: BatchAutoTranslationTaskPhase,
    options?: TransitionOptions,
  ): Promise<void> {
    await this.transition({
      transition: "bindRunAndStart",
      runId,
      claimId,
      phase,
      ...this.transitionIdentity(options),
    });
  }

  async progress(
    input: {
      current: number;
      total?: number;
      phase?: BatchAutoTranslationTaskPhase;
    },
    options?: TransitionOptions,
  ): Promise<void> {
    await this.transition({
      transition: "progress",
      progressCurrent: input.current,
      ...(input.total === undefined ? {} : { progressTotal: input.total }),
      ...(input.phase === undefined ? {} : { phase: input.phase }),
      ...this.transitionIdentity(options),
    });
  }

  async block(
    failure: OperationFailureInput,
    options?: TransitionOptions,
  ): Promise<void> {
    await this.transition({
      transition: "block",
      failure,
      ...this.transitionIdentity(options),
    });
  }

  async resume(options?: TransitionOptions): Promise<void> {
    await this.transition({
      transition: "resume",
      ...this.transitionIdentity(options),
    });
  }

  async complete(
    result: BatchAutoTranslationTaskResult,
    options?: TransitionOptions,
  ): Promise<void> {
    await this.transition({
      transition: "complete",
      result,
      ...this.transitionIdentity(options),
    });
  }

  async fail(
    failure: OperationFailureInput,
    options?: TransitionOptions,
  ): Promise<void> {
    await this.transition({
      transition: "fail",
      failure,
      ...this.transitionIdentity(options),
    });
  }

  async requestCancel(options?: TransitionOptions): Promise<void> {
    await this.transition({
      transition: "requestCancel",
      ...this.transitionIdentity(options),
    });
  }

  async confirmCancel(options?: TransitionOptions): Promise<void> {
    await this.transition({
      transition: "confirmCancel",
      owner: "WORKFLOW_ADAPTER",
      ...this.transitionIdentity(options),
    });
  }

  private transitionIdentity(options?: TransitionOptions) {
    return {
      requestId: options?.requestId ?? randomUUID(),
      ...(options?.projectionEventId
        ? { projectionEventId: options.projectionEventId }
        : {}),
      ...(options?.projectionEventSequence
        ? { projectionEventSequence: options.projectionEventSequence }
        : {}),
      ...(options?.expectedRunId
        ? { expectedRunId: options.expectedRunId }
        : {}),
    };
  }

  private isAlreadyReconciled(transition: TaskTransitionPayload): boolean {
    const { status, runtime } = this.#task.state;
    switch (transition.transition) {
      case "claimDispatch":
        return runtime.dispatchClaimId === transition.claimId;
      case "bindRun":
        return runtime.runId === transition.runId;
      case "bindRunAndStart":
        return (
          runtime.runId === transition.runId &&
          (status === "RUNNING" || status === "CANCEL_REQUESTED")
        );
      case "start":
        return status === "RUNNING" && runtime.phase !== null;
      case "progress":
        return status === "CANCEL_REQUESTED" || terminalStatuses.has(status);
      case "block":
        return status === "BLOCKED" || status === "CANCEL_REQUESTED";
      case "resume":
        return status === "PENDING" || status === "RUNNING";
      case "complete":
        return status === "COMPLETED";
      case "fail":
        return status === "FAILED";
      case "requestCancel":
        return status === "CANCEL_REQUESTED" || status === "CANCELED";
      case "confirmCancel":
        return status === "CANCELED";
      default:
        throw new Error("Unsupported task transition.");
    }
  }

  private async transition(transition: TaskTransitionPayload): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (this.isAlreadyReconciled(transition)) return;
      try {
        this.#task = await executeCommand(
          { db: this.db },
          transitionLocalizationTask,
          {
            taskId: this.#task.id,
            expectedRevision: this.#task.state.revision,
            ...transition,
          },
        );
        return;
      } catch (error) {
        if (!(error instanceof TaskRevisionConflictError)) throw error;
        await this.refresh();
      }
    }
    throw new TaskRevisionConflictError(this.#task.state.revision);
  }
}
