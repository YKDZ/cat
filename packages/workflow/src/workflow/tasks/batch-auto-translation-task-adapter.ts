import {
  createWorkflowTaskWithDispatch,
  executeCommand,
  executeQuery,
  getLocalizationTaskForWorkflow,
  type DbHandle,
  type LocalizationTaskSummary,
} from "@cat/domain";
import type { BatchAutoTranslationInvocation } from "@cat/shared";

/** Creates and reads the Task ledger; dispatch commands own every transition. */
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
    const resources = [
      { type: "PROJECT" as const, id: input.invocation.projectId },
      ...Array.from(new Set(input.invocation.elementIds)).map((elementId) => ({
        type: "ELEMENT" as const,
        id: String(elementId),
      })),
    ];
    const created = await executeCommand(
      { db: input.db },
      createWorkflowTaskWithDispatch,
      {
        task: {
          kind: "BATCH_AUTO_TRANSLATION",
          payload: { invocation: input.invocation, cancelable: true },
        },
        scope: { type: "PROJECT", id: input.invocation.projectId },
        actor: { type: "USER", id: input.actorId },
        resources,
      },
    );
    return new BatchAutoTranslationTaskAdapter(input.db, created.task);
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
}
