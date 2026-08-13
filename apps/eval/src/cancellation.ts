import { setTimeout } from "node:timers/promises";

type SignalListenerTarget = {
  on: (signal: NodeJS.Signals, listener: () => void) => unknown;
  removeListener: (signal: NodeJS.Signals, listener: () => void) => unknown;
};

export class EvalInterruptedError extends Error {
  public readonly exitCode = 130;

  public constructor(cause?: unknown) {
    super(
      "Evaluation interrupted.",
      cause === undefined ? undefined : { cause },
    );
    this.name = "EvalInterruptedError";
  }
}

export const throwIfEvaluationAborted = (
  signal: AbortSignal | undefined,
): void => {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (reason instanceof EvalInterruptedError) throw reason;
  throw new EvalInterruptedError(reason);
};

export const abortableEvaluationDelay = async (
  delayMs: number,
  signal: AbortSignal | undefined,
): Promise<void> => {
  throwIfEvaluationAborted(signal);
  try {
    await setTimeout(delayMs, undefined, { signal });
  } catch (error) {
    throwIfEvaluationAborted(signal);
    throw error;
  }
};

export const installEvaluationInterruptHandler = (
  target: SignalListenerTarget = process,
): { signal: AbortSignal; dispose: () => void } => {
  const controller = new AbortController();
  const interrupt = () => {
    if (!controller.signal.aborted)
      controller.abort(new EvalInterruptedError());
  };
  target.on("SIGINT", interrupt);
  target.on("SIGTERM", interrupt);

  return {
    signal: controller.signal,
    dispose: () => {
      target.removeListener("SIGINT", interrupt);
      target.removeListener("SIGTERM", interrupt);
    },
  };
};

export const waitForEvaluationInterrupt = async (
  signal: AbortSignal,
): Promise<void> => {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
};
