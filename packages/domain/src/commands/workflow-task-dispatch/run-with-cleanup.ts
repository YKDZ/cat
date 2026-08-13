type Attempt<T> =
  | { kind: "succeeded"; value: T }
  | { kind: "failed"; error: unknown };

const captureAttempt = async <T>(
  operation: () => Promise<T>,
): Promise<Attempt<T>> => {
  try {
    return { kind: "succeeded", value: await operation() };
  } catch (error: unknown) {
    return { kind: "failed", error };
  }
};

export const runWithCleanup = async <T>(
  operation: () => Promise<T>,
  cleanup: () => Promise<void>,
): Promise<T> => {
  const operationAttempt = await captureAttempt(operation);
  const cleanupAttempt = await captureAttempt(cleanup);

  if (operationAttempt.kind === "failed") {
    if (cleanupAttempt.kind === "failed") {
      throw new AggregateError(
        [operationAttempt.error, cleanupAttempt.error],
        "Operation and cleanup both failed.",
      );
    }
    throw operationAttempt.error;
  }
  if (cleanupAttempt.kind === "failed") throw cleanupAttempt.error;
  return operationAttempt.value;
};
