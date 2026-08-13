export type CleanupStep = () => void | Promise<void>;

/**
 * Runs every cleanup action in order, preserving an operation failure when cleanup also fails.
 */
export const runCleanupSteps = async (
  steps: readonly CleanupStep[],
  operationError?: unknown,
): Promise<void> => {
  const cleanupErrors: unknown[] = [];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (operationError !== undefined) {
    if (cleanupErrors.length === 0) throw operationError;
    throw new AggregateError(
      [operationError, ...cleanupErrors],
      "Eval operation failed and cleanup failed.",
    );
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "Eval cleanup failed.");
  }
};
