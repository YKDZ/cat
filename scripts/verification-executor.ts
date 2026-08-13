import {
  parseVerificationRecord,
  type VerificationNode,
  type VerificationPlan,
  type VerificationRecord,
  type VerificationRunIdentity,
} from "./verification-plan.ts";

export type VerificationNodeCleanup = () => Promise<void>;

export type VerificationNodeContext = {
  immutableInputs: Record<string, string>;
  node: VerificationNode;
  onCleanup: (cleanup: VerificationNodeCleanup) => void;
  signal: AbortSignal;
};

export type VerificationNodeResult = {
  artifacts?: Record<string, string>;
};

export type VerificationNodeHandler = (
  context: VerificationNodeContext,
) => Promise<VerificationNodeResult | void>;

export type VerificationNodeRegistry = Record<string, VerificationNodeHandler>;

export type VerificationNodeStatus = "blocked" | "failed" | "passed";

export type VerificationExecutionResult = {
  records: VerificationRecord[];
  statuses: Record<string, VerificationNodeStatus>;
};

export type VerificationExecutorOptions = {
  cleanupTimeoutMs?: number;
  handlerSettlementGraceMs?: number;
  maxConcurrency?: 1 | 2;
  nodeIds?: readonly string[];
  signal?: AbortSignal;
  sourceSha: string;
  timeoutMs?: Record<VerificationNode["timeoutClass"], number>;
  workflow?: VerificationRunIdentity | undefined;
};

export const verificationExecutorTimeoutBudget: Record<
  VerificationNode["timeoutClass"],
  number
> = {
  long: 40 * 60_000,
  short: 3 * 60_000,
  standard: 12 * 60_000,
};

export const verificationExecutorCleanupHeadroomMs = {
  handlerSettlement: 5 * 60_000,
  nodeCleanup: 5 * 60_000,
} as const;

const timeoutError = (node: VerificationNode): Error =>
  new Error(`Verification node ${node.id} timed out`);

const abortError = (node: VerificationNode): Error =>
  new Error(`Verification node ${node.id} was interrupted`);

const cleanupWithTimeout = async (
  cleanup: VerificationNodeCleanup,
  timeoutMs: number,
): Promise<void> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      cleanup(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Verification cleanup timed out")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

const settleHandler = async (
  execution: Promise<VerificationNodeResult | void>,
  node: VerificationNode,
  graceMs: number,
): Promise<unknown> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      execution.then(
        () => undefined,
        (error: unknown) => error,
      ),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `Verification node ${node.id} did not settle after interruption`,
              ),
            ),
          graceMs,
        );
      }),
    ]);
  } catch (error) {
    return error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

const executeNode = async (
  plan: VerificationPlan,
  node: VerificationNode,
  handler: VerificationNodeHandler,
  options: Required<
    Pick<
      VerificationExecutorOptions,
      "cleanupTimeoutMs" | "handlerSettlementGraceMs" | "sourceSha"
    >
  > & {
    signal?: AbortSignal | undefined;
    timeoutMs: Record<VerificationNode["timeoutClass"], number>;
    workflow?: VerificationRunIdentity | undefined;
  },
): Promise<VerificationRecord> => {
  const controller = new AbortController();
  const cleanups: VerificationNodeCleanup[] = [];
  const timeoutMs = options.timeoutMs[node.timeoutClass];
  let timedOut = false;
  let interrupted = false;
  const abort = (): void => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(timeoutError(node));
  }, timeoutMs);
  const startedAt = performance.now();
  let validationError: unknown;
  let result: VerificationNodeResult | void = undefined;
  let execution: Promise<VerificationNodeResult | void> | undefined;
  let aborted = false;
  try {
    execution = handler({
      immutableInputs: Object.fromEntries(
        node.immutableInputs.map((name) => [name, options.sourceSha]),
      ),
      node,
      onCleanup: (cleanup) => cleanups.push(cleanup),
      signal: controller.signal,
    });
    // A handler must observe its signal. Keep a rejection from a late handler
    // from becoming unhandled after the executor has moved on to cleanup.
    void execution.catch(() => undefined);
    result = await Promise.race([
      execution,
      new Promise<never>((_, reject) => {
        const onAbort = (): void => {
          aborted = true;
          interrupted = !timedOut;
          reject(timedOut ? timeoutError(node) : abortError(node));
        };
        controller.signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } catch (error) {
    validationError = error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }

  if (aborted && execution !== undefined) {
    const settlementError = await settleHandler(
      execution,
      node,
      options.handlerSettlementGraceMs,
    );
    if (settlementError !== undefined) {
      validationError = new AggregateError(
        [validationError, settlementError],
        `Verification node ${node.id} did not settle before cleanup`,
      );
    }
  }

  const cleanupErrors: unknown[] = [];
  for (const cleanup of cleanups.toReversed()) {
    try {
      await cleanupWithTimeout(cleanup, options.cleanupTimeoutMs);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (validationError !== undefined || cleanupErrors.length > 0) {
    const errors = [
      ...(validationError === undefined ? [] : [validationError]),
      ...cleanupErrors,
    ];
    if (errors.length === 1) throw errors[0];
    throw new AggregateError(
      errors,
      `Verification node ${node.id} failed: ${
        validationError instanceof Error
          ? validationError.message
          : interrupted
            ? abortError(node).message
            : "cleanup failed"
      }`,
    );
  }
  const artifacts = result?.artifacts ?? {};
  const expectedArtifacts = new Set(node.requiredArtifacts);
  if (
    Object.keys(artifacts).length !== expectedArtifacts.size ||
    Object.keys(artifacts).some(
      (artifact) =>
        !expectedArtifacts.has(artifact) ||
        artifacts[artifact] === undefined ||
        artifacts[artifact] === "",
    )
  ) {
    throw new Error(`Verification node ${node.id} returned invalid artifacts`);
  }
  return parseVerificationRecord({
    artifacts,
    cleanupCompleted: true,
    durationMs: Math.round(performance.now() - startedAt),
    immutableInputs: Object.fromEntries(
      node.immutableInputs.map((name) => [name, options.sourceSha]),
    ),
    lane: node.lane,
    nodeId: node.id,
    planDigest: plan.digest,
    schemaVersion: 1,
    ...(options.workflow === undefined ? {} : { workflow: options.workflow }),
  });
};

const selectedNodes = (
  plan: VerificationPlan,
  nodeIds: readonly string[] | undefined,
): VerificationNode[] => {
  if (nodeIds === undefined) {
    return plan.nodes.filter((node) => node.requiredRecord);
  }
  const selected = new Set(nodeIds);
  if (selected.size !== nodeIds.length) {
    throw new Error("Verification node selection has duplicates");
  }
  for (const nodeId of selected) {
    const node = plan.nodes.find((candidate) => candidate.id === nodeId);
    if (node === undefined || !node.requiredRecord) {
      throw new Error(`Verification plan has no executable node ${nodeId}`);
    }
  }
  return plan.nodes.filter((node) => selected.has(node.id));
};

export const executeVerificationNode = async (
  plan: VerificationPlan,
  nodeId: string,
  registry: VerificationNodeRegistry,
  options: VerificationExecutorOptions,
): Promise<VerificationRecord> => {
  const node = plan.nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined || !node.requiredRecord) {
    throw new Error(`Verification plan has no executable node ${nodeId}`);
  }
  const handler = registry[node.id];
  if (handler === undefined) {
    throw new Error(`Verification node registry has no handler for ${node.id}`);
  }
  return await executeNode(plan, node, handler, {
    cleanupTimeoutMs:
      options.cleanupTimeoutMs ??
      verificationExecutorCleanupHeadroomMs.nodeCleanup,
    handlerSettlementGraceMs:
      options.handlerSettlementGraceMs ??
      verificationExecutorCleanupHeadroomMs.handlerSettlement,
    signal: options.signal,
    sourceSha: options.sourceSha,
    timeoutMs: { ...verificationExecutorTimeoutBudget, ...options.timeoutMs },
    ...(options.workflow === undefined ? {} : { workflow: options.workflow }),
  });
};

export const executeVerificationPlan = async (
  plan: VerificationPlan,
  registry: VerificationNodeRegistry,
  options: VerificationExecutorOptions,
): Promise<VerificationExecutionResult> => {
  const nodes = selectedNodes(plan, options.nodeIds);
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    if (registry[node.id] === undefined) {
      throw new Error(
        `Verification node registry has no handler for ${node.id}`,
      );
    }
    if (node.dependencies.some((dependency) => !nodesById.has(dependency))) {
      throw new Error(
        `Verification node ${node.id} has an unselected dependency`,
      );
    }
  }
  const resolvedOptions = {
    cleanupTimeoutMs:
      options.cleanupTimeoutMs ??
      verificationExecutorCleanupHeadroomMs.nodeCleanup,
    handlerSettlementGraceMs:
      options.handlerSettlementGraceMs ??
      verificationExecutorCleanupHeadroomMs.handlerSettlement,
    maxConcurrency: options.maxConcurrency ?? 2,
    signal: options.signal,
    sourceSha: options.sourceSha,
    timeoutMs: { ...verificationExecutorTimeoutBudget, ...options.timeoutMs },
    workflow: options.workflow,
  };
  const statuses = new Map<string, VerificationNodeStatus>();
  const records: VerificationRecord[] = [];
  const failures: unknown[] = [];
  const active = new Map<string, Promise<void>>();
  let activeDocker = 0;

  const start = (node: VerificationNode): void => {
    if (node.resourceLane === "docker") activeDocker += 1;
    const running = executeNode(plan, node, registry[node.id]!, resolvedOptions)
      .then((record) => {
        records.push(record);
        statuses.set(node.id, "passed");
      })
      .catch((error: unknown) => {
        failures.push(error);
        statuses.set(node.id, "failed");
      })
      .finally(() => {
        if (node.resourceLane === "docker") activeDocker -= 1;
        active.delete(node.id);
      });
    active.set(node.id, running);
  };

  while (statuses.size < nodes.length || active.size > 0) {
    for (const node of nodes) {
      if (statuses.has(node.id) || active.has(node.id)) continue;
      if (
        node.dependencies.some(
          (dependency) =>
            statuses.get(dependency) === "failed" ||
            statuses.get(dependency) === "blocked",
        )
      ) {
        statuses.set(node.id, "blocked");
      }
    }
    let started = false;
    for (const node of nodes) {
      if (active.size >= resolvedOptions.maxConcurrency) break;
      if (statuses.has(node.id) || active.has(node.id)) continue;
      if (resolvedOptions.signal?.aborted) {
        statuses.set(node.id, "blocked");
        continue;
      }
      if (
        node.dependencies.some(
          (dependency) => statuses.get(dependency) !== "passed",
        )
      )
        continue;
      if (node.resourceLane === "docker" && activeDocker > 0) continue;
      start(node);
      started = true;
    }
    if (
      active.size > 0 &&
      (!started || active.size >= resolvedOptions.maxConcurrency)
    ) {
      await Promise.race(active.values());
      continue;
    }
    if (active.size === 0) break;
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, "Complete verification failed");
  }
  return { records, statuses: Object.fromEntries(statuses) };
};
