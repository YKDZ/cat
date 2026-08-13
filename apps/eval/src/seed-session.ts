import {
  throwIfEvaluationAborted,
  waitForEvaluationInterrupt,
} from "./cancellation.ts";

export type SeedSessionContext = {
  cleanup: () => Promise<void>;
};

export const runSeedSession = async <T extends SeedSessionContext>(opts: {
  signal: AbortSignal;
  seed: (signal: AbortSignal) => Promise<T>;
  onReady: (context: T) => Promise<void> | void;
}): Promise<void> => {
  let context: T | undefined;
  try {
    throwIfEvaluationAborted(opts.signal);
    context = await opts.seed(opts.signal);
    throwIfEvaluationAborted(opts.signal);
    await opts.onReady(context);
    await waitForEvaluationInterrupt(opts.signal);
    throwIfEvaluationAborted(opts.signal);
  } finally {
    await context?.cleanup();
  }
};
