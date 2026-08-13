import type { DbHandle } from "@cat/domain";
import {
  claimRecallDerivationDemands,
  executeCommand,
  executeQuery,
  getRecallDerivationStates,
  reconcileRecallDerivationDemands,
  recordRecallDerivationFailure,
  releaseRecallDerivationWorkerLeases,
  renewRecallDerivationLease,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { serverLogger as logger } from "@cat/server-shared";
import {
  classifyRecallDerivationBlocker,
  NormalizedLanguageIdSchema,
  RecallDerivationReferenceSchema,
  type RecallDerivationBlocker,
  type RecallDerivationReference,
} from "@cat/shared";

import { glossaryRecallDerivationAdapter } from "./glossary-recall-derivation.ts";
import { memoryRecallDerivationAdapter } from "./memory-recall-derivation.ts";
import {
  RecallDerivationAdapterError,
  type LeasedRecallDerivationClaim,
  type RecallDerivationAdapter,
} from "./recall-derivation-adapter.ts";

/** The runtime only dispatches the two supported recall assets. */
export const recallDerivationAdapters = {
  MEMORY_ITEM: memoryRecallDerivationAdapter,
  TERM_CONCEPT: glossaryRecallDerivationAdapter,
} satisfies {
  MEMORY_ITEM: RecallDerivationAdapter<"MEMORY_ITEM">;
  TERM_CONCEPT: RecallDerivationAdapter<"TERM_CONCEPT">;
};

const adapterForClaim = (
  claim: LeasedRecallDerivationClaim,
): RecallDerivationAdapter<"MEMORY_ITEM" | "TERM_CONCEPT"> => {
  switch (claim.targetKind) {
    case "MEMORY_ITEM":
      return recallDerivationAdapters.MEMORY_ITEM;
    case "TERM_CONCEPT":
      return recallDerivationAdapters.TERM_CONCEPT;
    default: {
      throw new TypeError(
        `Unsupported Recall target kind: ${String(claim.targetKind)}`,
      );
    }
  }
};

const adapterForReference = (reference: RecallDerivationReference) => {
  switch (reference.targetKind) {
    case "MEMORY_ITEM":
      return recallDerivationAdapters.MEMORY_ITEM;
    case "TERM_CONCEPT":
      return recallDerivationAdapters.TERM_CONCEPT;
    default: {
      throw new TypeError("Unsupported Recall target kind");
    }
  }
};

export type RecallDerivationStateCommit =
  | "RECONCILED"
  | "CLAIMED"
  | "PUBLISHED"
  | "STALE"
  | "FAILED"
  | "RELEASED";

export type RecallDerivationStateCommitObserver = (
  commit: RecallDerivationStateCommit,
) => Promise<void>;

export type ProcessRecallDerivationBatchOptions = {
  db: DbHandle;
  pluginManager: PluginManager;
  signal?: AbortSignal | undefined;
  workerId?: string | undefined;
  limit?: number | undefined;
  leaseDurationMs?: number | undefined;
  maxAttempts?: number | undefined;
  onStateCommitted?: RecallDerivationStateCommitObserver | undefined;
};

const observeStateCommit = async (
  observer: RecallDerivationStateCommitObserver | undefined,
  commit: RecallDerivationStateCommit,
) => {
  try {
    await observer?.(commit);
  } catch (error) {
    logger.warn("Recall derivation state observer failed", { error, commit });
  }
};

export const processRecallDerivationBatch = async (
  options: ProcessRecallDerivationBatchOptions,
): Promise<{
  claimed: number;
  published: number;
  stale: number;
  failed: number;
}> => {
  const workerId = options.workerId ?? crypto.randomUUID();
  const leaseDurationMs = options.leaseDurationMs ?? 60_000;
  const limit = options.limit ?? 10;
  await executeCommand(
    { db: options.db },
    reconcileRecallDerivationDemands,
    {},
  );
  await observeStateCommit(options.onStateCommitted, "RECONCILED");
  let claimed = 0;
  let published = 0;
  let stale = 0;
  let failed = 0;
  for (let index = 0; index < limit; index += 1) {
    if (options.signal?.aborted) break;
    const [claim] = await executeCommand(
      { db: options.db },
      claimRecallDerivationDemands,
      { workerId, limit: 1, leaseDurationMs },
    );
    if (!claim) break;
    claimed += 1;
    await observeStateCommit(options.onStateCommitted, "CLAIMED");
    if (!claim.leaseToken) {
      await executeCommand(
        { db: options.db },
        reconcileRecallDerivationDemands,
        {},
      );
      failed += 1;
      await observeStateCommit(options.onStateCommitted, "RECONCILED");
      continue;
    }
    const fence = {
      stateId: claim.id,
      demandRevision: claim.demandRevision,
      executionEpoch: claim.executionEpoch,
      leaseToken: claim.leaseToken,
      canonicalInputVersion: claim.canonicalInputVersion,
    };
    let renewal: Promise<void> | undefined;
    const renewLease = () => {
      if (renewal) return;
      renewal = (async () => {
        try {
          await executeCommand({ db: options.db }, renewRecallDerivationLease, {
            ...fence,
            leaseDurationMs,
          });
        } catch {
          // Publication and failure recording remain fenced if renewal failed.
        } finally {
          renewal = undefined;
        }
      })();
    };
    const heartbeat = setInterval(
      renewLease,
      Math.max(1_000, Math.floor(leaseDurationMs / 3)),
    );
    heartbeat.unref();
    try {
      const leasedClaim: LeasedRecallDerivationClaim = {
        ...claim,
        languageId: NormalizedLanguageIdSchema.parse(claim.languageId),
        leaseToken: claim.leaseToken,
      };
      const adapter = adapterForClaim(leasedClaim);
      const result = await adapter.deriveAndPublish({
        db: options.db,
        pluginManager: options.pluginManager,
        claim: leasedClaim,
        ...(options.signal ? { signal: options.signal } : {}),
      });
      if (result.reconciled) {
        await observeStateCommit(options.onStateCommitted, "RECONCILED");
      }
      if (result.status === "PUBLISHED") {
        published += 1;
        await observeStateCommit(options.onStateCommitted, "PUBLISHED");
      } else {
        stale += 1;
        await observeStateCommit(options.onStateCommitted, "STALE");
      }
    } catch (error) {
      if (options.signal?.aborted) continue;
      const blocker: RecallDerivationBlocker =
        error instanceof RecallDerivationAdapterError
          ? error.blocker
          : {
              reason: "DERIVATION_EXECUTION",
              retryable: false,
              message: error instanceof Error ? error.message : String(error),
            };
      const result = await executeCommand(
        { db: options.db },
        recordRecallDerivationFailure,
        {
          ...fence,
          blocker,
          maxAttempts: options.maxAttempts ?? 5,
          initialBackoffMs: 1_000,
          maxBackoffMs: 60_000,
        },
      );
      if (result.status === "STALE") {
        stale += 1;
        await observeStateCommit(options.onStateCommitted, "STALE");
      } else {
        failed += 1;
        await observeStateCommit(options.onStateCommitted, "FAILED");
      }
    } finally {
      clearInterval(heartbeat);
      await renewal;
    }
  }
  return { claimed, published, stale, failed };
};

const formatRecallDerivationBlockers = (
  blockers: RecallDerivationBlocker[],
) => {
  const unique = [
    ...new Set(
      blockers.map((blocker) => `${blocker.reason}: ${blocker.message}`),
    ),
  ];
  if (unique.length === 0) return "";
  const displayed = unique.slice(0, 5);
  return ` Blockers: ${displayed.join("; ")}${unique.length === displayed.length ? "" : `; +${unique.length - displayed.length} more`}`;
};

export class RecallDerivationFreshnessError extends Error {
  public readonly status: "BLOCKED" | "FAILED" | "TIMEOUT";
  public readonly references: RecallDerivationReference[];
  public readonly blockers: RecallDerivationBlocker[];

  public constructor(
    status: "BLOCKED" | "FAILED" | "TIMEOUT",
    references: RecallDerivationReference[],
    blockers: RecallDerivationBlocker[] = [],
  ) {
    super(
      `Recall Derivation freshness wait ended with ${status}.${formatRecallDerivationBlockers(blockers)}`,
    );
    this.name = "RecallDerivationFreshnessError";
    this.status = status;
    this.references = references;
    this.blockers = blockers;
  }
}

export type RecallDerivationFreshnessAssessment =
  | { status: "FRESH" }
  | {
      status: "PENDING";
      references: RecallDerivationReference[];
      blockers: RecallDerivationBlocker[];
    }
  | { status: "MISSING"; references: RecallDerivationReference[] }
  | {
      status: "BLOCKED" | "FAILED";
      references: RecallDerivationReference[];
      blockers: RecallDerivationBlocker[];
    };

const referenceKey = (reference: {
  targetKind: RecallDerivationReference["targetKind"];
  targetId: RecallDerivationReference["targetId"];
  languageId: RecallDerivationReference["languageId"];
}) => `${reference.targetKind}\0${reference.targetId}\0${reference.languageId}`;

const assessPersistedRecallDerivationFreshness = async (
  references: RecallDerivationReference[],
  db: DbHandle,
): Promise<RecallDerivationFreshnessAssessment> => {
  if (references.length === 0) return { status: "FRESH" };
  const states = await executeQuery({ db }, getRecallDerivationStates, {
    references,
  });
  const byKey = new Map(
    states.map((state) => [
      referenceKey({
        ...state,
        languageId: NormalizedLanguageIdSchema.parse(state.languageId),
      }),
      state,
    ]),
  );
  const missing = references.filter(
    (reference) => !byKey.has(referenceKey(reference)),
  );
  if (missing.length > 0) return { status: "MISSING", references: missing };
  const current = references.map(
    (reference) => byKey.get(referenceKey(reference))!,
  );
  const terminal = current.flatMap((state) => {
    if (state.status !== "BLOCKED" && state.status !== "FAILED") return [];
    if (!state.blocker) return [{ state, status: state.status }];
    const lifecycle = classifyRecallDerivationBlocker(state.blocker);
    if (lifecycle === "PENDING") {
      return state.status === "FAILED"
        ? [{ state, status: "FAILED" as const }]
        : [];
    }
    return [{ state, status: lifecycle }];
  });
  if (terminal.length > 0) {
    const status = terminal.some((entry) => entry.status === "FAILED")
      ? "FAILED"
      : "BLOCKED";
    return {
      status,
      references: terminal.map(({ state }) =>
        RecallDerivationReferenceSchema.parse({
          targetKind: state.targetKind,
          targetId: state.targetId,
          languageId: state.languageId,
          demandRevision: state.demandRevision,
        }),
      ),
      blockers: terminal.flatMap(({ state }) =>
        state.blocker ? [state.blocker] : [],
      ),
    };
  }
  const pending = current.flatMap((state, index) => {
    const reference = references[index]!;
    const isFresh =
      state.status === "FRESH" &&
      state.demandRevision >= reference.demandRevision &&
      state.currentCanonicalInputVersion === state.canonicalInputVersion &&
      state.currentDerivationVersion === state.requiredDerivationVersion;
    return isFresh ? [] : [{ state, reference }];
  });
  if (pending.length === 0) return { status: "FRESH" };
  return {
    status: "PENDING",
    references: pending.map(({ reference }) => reference),
    blockers: pending.flatMap(({ state }) =>
      state.blocker &&
      classifyRecallDerivationBlocker(state.blocker) === "PENDING"
        ? [state.blocker]
        : [],
    ),
  };
};

const abortableDelay = async (delayMs: number, signal?: AbortSignal) => {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    timer.unref();
    signal?.addEventListener("abort", onAbort, { once: true });
  });
};

const assessProbeFailure = (error: unknown) => {
  const blockers =
    error instanceof RecallDerivationAdapterError
      ? error.blockers
      : [
          {
            reason: "DERIVATION_EXECUTION" as const,
            retryable: false,
            message: error instanceof Error ? error.message : String(error),
          },
        ];
  const lifecycles = blockers.map(classifyRecallDerivationBlocker);
  const status: "FAILED" | "BLOCKED" | "PENDING" = lifecycles.includes("FAILED")
    ? "FAILED"
    : lifecycles.includes("BLOCKED")
      ? "BLOCKED"
      : "PENDING";
  return { status, blockers };
};

export const assessRecallDerivationFreshness = async (
  references: RecallDerivationReference[],
  options: {
    db: DbHandle;
    pluginManager: PluginManager;
    signal?: AbortSignal | undefined;
    dependencyProbeTimeoutMs?: number | undefined;
    onStateCommitted?: RecallDerivationStateCommitObserver | undefined;
  },
): Promise<RecallDerivationFreshnessAssessment> => {
  if (references.length === 0) return { status: "FRESH" };
  const probes = new Map<
    string,
    {
      references: RecallDerivationReference[];
      adapter:
        | RecallDerivationAdapter<"MEMORY_ITEM">
        | RecallDerivationAdapter<"TERM_CONCEPT">;
    }
  >();
  for (const reference of references) {
    const key = `${reference.targetKind}\0${reference.languageId}`;
    const current = probes.get(key);
    if (current) current.references.push(reference);
    else
      probes.set(key, {
        references: [reference],
        adapter: adapterForReference(reference),
      });
  }
  const failures: Array<{
    error: unknown;
    references: RecallDerivationReference[];
  }> = [];
  for (const { references: probeReferences, adapter } of probes.values()) {
    try {
      const result = await adapter.probeCurrentDependencies({
        db: options.db,
        pluginManager: options.pluginManager,
        languageIds: [probeReferences[0]!.languageId],
        timeoutMs: options.dependencyProbeTimeoutMs ?? 5_000,
        signal: options.signal,
      });
      if (result.committed) {
        await observeStateCommit(options.onStateCommitted, "RECONCILED");
      }
    } catch (error) {
      options.signal?.throwIfAborted();
      if (error instanceof RecallDerivationAdapterError && error.committed) {
        await observeStateCommit(options.onStateCommitted, "RECONCILED");
      }
      failures.push({ error, references: probeReferences });
    }
  }
  if (failures.length > 0) {
    const failure = assessProbeFailure(
      new RecallDerivationAdapterError(
        failures.flatMap(({ error }) =>
          error instanceof RecallDerivationAdapterError
            ? error.blockers
            : [
                {
                  reason: "DERIVATION_EXECUTION" as const,
                  retryable: false,
                  message:
                    error instanceof Error ? error.message : String(error),
                },
              ],
        ),
        new AggregateError(failures.map(({ error }) => error)),
        failures.some(
          ({ error }) =>
            error instanceof RecallDerivationAdapterError && error.committed,
        ),
      ),
    );
    return {
      status: failure.status,
      references: failures.flatMap(({ references: failed }) => failed),
      blockers: failure.blockers,
    };
  }
  return await assessPersistedRecallDerivationFreshness(references, options.db);
};

export type WaitForRecallDerivationFreshOptions = {
  db: DbHandle;
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
  pollIntervalMs?: number | undefined;
};

export const waitForRecallDerivationFresh = async (
  references: RecallDerivationReference[],
  options: WaitForRecallDerivationFreshOptions,
): Promise<void> => {
  if (references.length === 0) return;
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (timeoutMs <= 0)
    throw new RecallDerivationFreshnessError("TIMEOUT", references);
  const deadlineSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, deadlineSignal])
    : deadlineSignal;
  try {
    while (true) {
      signal.throwIfAborted();
      const assessment = await assessPersistedRecallDerivationFreshness(
        references,
        options.db,
      );
      if (assessment.status === "FRESH") return;
      if (assessment.status === "FAILED") {
        throw new RecallDerivationFreshnessError(
          assessment.status,
          assessment.references,
          assessment.blockers,
        );
      }
      if (
        assessment.status === "BLOCKED" &&
        (assessment.blockers.length === 0 ||
          assessment.blockers.some((blocker) => !blocker.retryable))
      ) {
        throw new RecallDerivationFreshnessError(
          assessment.status,
          assessment.references,
          assessment.blockers,
        );
      }
      await abortableDelay(options.pollIntervalMs ?? 100, signal);
    }
  } catch (error) {
    options.signal?.throwIfAborted();
    if (
      deadlineSignal.aborted &&
      !(error instanceof RecallDerivationFreshnessError)
    ) {
      throw new RecallDerivationFreshnessError("TIMEOUT", references);
    }
    throw error;
  }
};

export type RecallDerivationWorker = { stop: () => Promise<void> };

export const startRecallDerivationWorker = async (
  options: Omit<ProcessRecallDerivationBatchOptions, "signal"> & {
    pollIntervalMs?: number | undefined;
    dependencyProbeIntervalMs?: number | undefined;
    dependencyProbeTimeoutMs?: number | undefined;
    initialErrorBackoffMs?: number | undefined;
    maxErrorBackoffMs?: number | undefined;
  },
): Promise<RecallDerivationWorker> => {
  const controller = new AbortController();
  let stopped = false;
  const workerId = options.workerId ?? crypto.randomUUID();
  await executeCommand(
    { db: options.db },
    reconcileRecallDerivationDemands,
    {},
  );
  await observeStateCommit(options.onStateCommitted, "RECONCILED");
  let nextDependencyProbeAt = 0;
  let consecutiveFailures = 0;
  const run = (async () => {
    try {
      while (!controller.signal.aborted) {
        try {
          if (Date.now() >= nextDependencyProbeAt) {
            nextDependencyProbeAt =
              Date.now() + (options.dependencyProbeIntervalMs ?? 30_000);
            for (const adapter of Object.values(recallDerivationAdapters)) {
              try {
                const result = await adapter.probeCurrentDependencies({
                  db: options.db,
                  pluginManager: options.pluginManager,
                  timeoutMs: options.dependencyProbeTimeoutMs ?? 5_000,
                  signal: controller.signal,
                });
                if (result.committed) {
                  await observeStateCommit(
                    options.onStateCommitted,
                    "RECONCILED",
                  );
                }
              } catch (error) {
                if (
                  error instanceof RecallDerivationAdapterError &&
                  error.committed
                ) {
                  await observeStateCommit(
                    options.onStateCommitted,
                    "RECONCILED",
                  );
                }
                logger
                  .child({ component: "recall-derivation-worker", workerId })
                  .warn("Recall Derivation dependency probe failed", {
                    error,
                    targetKind: adapter.targetKind,
                  });
              }
            }
          }
          await processRecallDerivationBatch({
            ...options,
            workerId,
            signal: controller.signal,
          });
          consecutiveFailures = 0;
          await abortableDelay(
            options.pollIntervalMs ?? 250,
            controller.signal,
          );
        } catch (error) {
          if (controller.signal.aborted) break;
          consecutiveFailures += 1;
          logger
            .child({ component: "recall-derivation-worker", workerId })
            .error("Recall Derivation worker iteration failed", { error });
          const backoffMs = Math.min(
            options.maxErrorBackoffMs ?? 30_000,
            (options.initialErrorBackoffMs ?? 250) *
              2 ** Math.min(consecutiveFailures - 1, 10),
          );
          await abortableDelay(backoffMs, controller.signal).catch(
            (delayError: unknown) => {
              if (!controller.signal.aborted) throw delayError;
            },
          );
        }
      }
    } finally {
      await executeCommand(
        { db: options.db },
        releaseRecallDerivationWorkerLeases,
        { workerId },
      );
      await observeStateCommit(options.onStateCommitted, "RELEASED");
    }
  })();
  return {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      controller.abort();
      await run;
    },
  };
};
