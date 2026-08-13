import type { DbHandle } from "@cat/domain";
import {
  executeCommand,
  executeQuery,
  listRecallDerivationTasksNeedingProjection,
  projectRecallDerivationTasks,
} from "@cat/domain";
import { serverLogger as logger } from "@cat/server-shared";

/** Projects committed runtime state into the product-facing Task ledger. */
export const projectPendingRecallDerivationTasks = async (input: {
  db: DbHandle;
  limit?: number | undefined;
}): Promise<void> => {
  try {
    const taskIds = await executeQuery(
      { db: input.db },
      listRecallDerivationTasksNeedingProjection,
      { limit: input.limit ?? 25 },
    );
    for (const taskId of taskIds) {
      try {
        await executeCommand({ db: input.db }, projectRecallDerivationTasks, {
          taskIds: [taskId],
        });
      } catch (error) {
        logger.error(
          "Recall derivation Task projection reconciliation failed",
          {
            error,
            taskId,
          },
        );
      }
    }
  } catch (error) {
    logger.error(
      "Recall derivation Task projection reconciliation discovery failed",
      {
        error,
      },
    );
  }
};

export const createRecallDerivationTaskProjectionObserver =
  (input: { db: DbHandle; limit?: number | undefined }) =>
  async (): Promise<void> =>
    await projectPendingRecallDerivationTasks(input);
