import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { formatDiagnosticErrorTree } from "@cat/shared";

import { runApplicationLifecycle } from "./check-all-containers.ts";
import {
  executeVerificationPlan,
  type VerificationNodeRegistry,
} from "./verification-executor.ts";
import {
  createLocalVerificationNodeRegistry,
  type LocalCandidateRoundTrip,
} from "./verification-node-registry.ts";
import {
  aggregateVerificationRecords,
  createVerificationPlan,
  type VerificationPlan,
  type VerificationRecord,
} from "./verification-plan.ts";
import { runVerificationCommand } from "./verification-runtime.ts";

export type RunCompleteVerificationOptions = {
  buildId?: string;
  createRegistry?: (options: {
    buildId: string;
    env: NodeJS.ProcessEnv;
    plan: VerificationPlan;
    projectName: string;
    sourceSha: string;
  }) => {
    candidates: Pick<LocalCandidateRoundTrip, "cleanup">;
    registry: VerificationNodeRegistry;
  };
  env?: NodeJS.ProcessEnv;
  log?: (message: string) => void;
  reportError?: (message: string) => void;
  run?: typeof runVerificationCommand;
  signals?: {
    off(signal: "SIGINT" | "SIGTERM", listener: () => void): unknown;
    on(signal: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  };
  sourceSha?: string;
  plan?: VerificationPlan;
  aggregateRecords?: (
    plan: VerificationPlan,
    records: VerificationRecord[],
    options: { sourceSha: string },
  ) => unknown;
};

export class CompleteVerificationInterruptedError extends Error {
  readonly signal: "SIGINT" | "SIGTERM";

  constructor(signal: "SIGINT" | "SIGTERM", cause?: unknown) {
    super(`Complete verification interrupted by ${signal}`, {
      ...(cause === undefined ? {} : { cause }),
    });
    this.name = "CompleteVerificationInterruptedError";
    this.signal = signal;
  }
}

const combineFailures = (primary: unknown, cleanup: unknown): void => {
  if (primary === undefined && cleanup === undefined) return;
  if (primary === undefined) throw cleanup;
  if (cleanup === undefined) throw primary;
  throw new AggregateError(
    [primary, cleanup],
    "Complete verification and cleanup both failed",
  );
};

export const runCompleteVerification = async (
  options: RunCompleteVerificationOptions = {},
): Promise<void> => {
  const env = { ...process.env, ...options.env };
  const signals = options.signals ?? process;
  const controller = new AbortController();
  let interruptedBy: "SIGINT" | "SIGTERM" | undefined;
  const listeners = new Map<"SIGINT" | "SIGTERM", () => void>();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    const listener = (): void => {
      interruptedBy ??= signal;
      controller.abort();
    };
    listeners.set(signal, listener);
    signals.on(signal, listener);
  }
  const sourceSha =
    options.sourceSha ?? env.GITHUB_SHA ?? `local-${randomUUID()}`;
  const buildId = options.buildId ?? sourceSha;
  const projectName = `cat-verification-${process.pid}-${randomUUID().slice(0, 8)}`;
  const plan = options.plan ?? createVerificationPlan();
  const registryOptions = { buildId, env, plan, projectName, sourceSha };
  const { candidates, registry } =
    options.createRegistry?.(registryOptions) ??
    createLocalVerificationNodeRegistry({
      ...registryOptions,
      lifecycle: runApplicationLifecycle,
      planIdentity: plan.digest,
      ...(options.log === undefined ? {} : { report: options.log }),
      ...(options.reportError === undefined
        ? {}
        : { reportError: options.reportError }),
      run: options.run ?? runVerificationCommand,
    });
  let primary: unknown;
  let cleanup: unknown;
  try {
    const result = await executeVerificationPlan(plan, registry, {
      signal: controller.signal,
      sourceSha,
    });
    (options.aggregateRecords ?? aggregateVerificationRecords)(
      plan,
      result.records,
      {
        sourceSha,
      },
    );
    if (interruptedBy !== undefined) {
      throw new CompleteVerificationInterruptedError(interruptedBy);
    }
  } catch (error) {
    primary =
      interruptedBy === undefined
        ? error
        : new CompleteVerificationInterruptedError(interruptedBy, error);
  } finally {
    try {
      await candidates.cleanup();
    } catch (error) {
      cleanup = error;
    }
    for (const [signal, listener] of listeners) signals.off(signal, listener);
  }
  combineFailures(primary, cleanup);
};

const directExecution = (): boolean =>
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (directExecution()) {
  try {
    await runCompleteVerification();
  } catch (error) {
    process.stderr.write(`${formatDiagnosticErrorTree(error)}\n`);
    process.exitCode =
      error instanceof CompleteVerificationInterruptedError
        ? error.signal === "SIGINT"
          ? 130
          : 143
        : 1;
  }
}
