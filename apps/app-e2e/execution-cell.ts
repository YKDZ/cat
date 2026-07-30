// oxlint-disable no-console -- the cell owns subprocess lifecycle diagnostics.
import {
  execFileSync,
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import {
  createConnection,
  createServer,
  type Server,
  type Socket,
} from "node:net";
import { join, resolve } from "node:path";

import { DrizzleDB, vectorizedString } from "@cat/db";
import {
  createContentNodeUnderParent,
  createElements,
  createPR,
  createProject,
  createQaReviewRunWithFindings,
  createRootContentNode,
  createTranslations,
  executeCommand,
  materializeQaReviewQueueItem,
  updatePRStatus,
} from "@cat/domain";
import { loadDevSeed, runFixtureHydration, type RefResolver } from "@cat/seed";
import { formatDiagnosticErrorTree, redactDiagnosticText } from "@cat/shared";
import { Client } from "pg";
import { createClient } from "redis";

import {
  createDevProbeWorkspace,
  removeDevProbeWorkspace,
  type DevProbeWorkspace,
} from "./dev-probe-workspace.ts";
import type { TestServiceLease } from "./test-service-lease.ts";

const root = resolve(import.meta.dirname, "../..");
const e2eArtifactRoot = join(root, ".tmp", "e2e");
const searchRuntimeInitializationPath = join(
  root,
  "apps",
  "postgres-search-runtime",
  "init",
  "01-init-extensions.sql",
);
const startupTimeoutMs = 300_000;
const cleanupTimeoutMs = 60_000;
const cleanupSettlementTimeoutMs = 10_000;
const processTerminationGraceMs = 5_000;
const forcedProcessExitTimeoutMs = 5_000;
const logDrainTimeoutMs = 5_000;
const playwrightTimeoutMs = 480_000;

export type ExecutionTarget = "dev" | "standalone" | "runtime";
export type ExecutionBrowser = "chromium" | "firefox";

type CommonExecutionCellInput = {
  lease: TestServiceLease;
};

export type ExecutionCellInput =
  | (CommonExecutionCellInput & {
      browser: "chromium";
      target: "dev";
    })
  | (CommonExecutionCellInput & {
      browser: "chromium" | "firefox";
      imageId: string;
      target: "standalone";
    })
  | (CommonExecutionCellInput & {
      browser: "chromium" | "firefox";
      imageId: string;
      preparerImageId: string;
      target: "runtime";
    });

export type CellRuntime = {
  applicationBindHost: string;
  applicationPort: number;
  applicationUrl: string;
  artifactDirectory: string;
  baseUrl: string;
  databaseName: string;
  databaseUrl: string;
  environment: NodeJS.ProcessEnv;
  port: number;
  probeWorkspace: DevProbeWorkspace;
  redisNamespace: string;
  refsPath: string;
  serviceNetworkName: string;
  storageDirectory: string;
  storageVolumeName?: string;
};

export type StartedProcess = {
  child: ChildProcess;
  containerName?: string;
  diagnostics: Error[];
  drainLogs?: () => Promise<void>;
  environment?: NodeJS.ProcessEnv;
  forceDrainLogs?: () => void;
  label: string;
  ownedPids: Set<number>;
  processIdentities: Map<number, ProcessIdentity>;
};

type ProcessIdentity = {
  command: string;
  startTime: string;
};

export type TargetAdapter = {
  applyExternalServicePlan: (runtime: CellRuntime) => Promise<void>;
  attest: (runtime: CellRuntime, process: StartedProcess) => Promise<void>;
  bootstrap: (runtime: CellRuntime) => Promise<void>;
  prepare: (runtime: CellRuntime) => Promise<void>;
  start: (
    runtime: CellRuntime,
    attempt: "bootstrap" | "validation",
  ) => Promise<StartedProcess>;
  stop: (process: StartedProcess, signal?: AbortSignal) => Promise<void>;
};

type Disposer = (signal: AbortSignal) => Promise<void>;

type RegisteredDisposer = {
  active: boolean;
  dispose: Disposer;
  label: string;
};

export type ExecutionCellDependencies = {
  createRuntime?: (
    register: (label: string, disposer: Disposer) => () => void,
  ) => Promise<CellRuntime>;
  cleanupSettlementTimeoutMs?: number;
  cleanupTimeoutMs?: number;
  createTarget?: (input: ExecutionCellInput) => TargetAdapter;
  hydrateFixtures?: (runtime: CellRuntime) => Promise<void>;
  removeArtifacts?: (directory: string) => Promise<void>;
  runPlaywright?: (
    environment: NodeJS.ProcessEnv,
    target: ExecutionTarget,
    browser: ExecutionBrowser,
    signal: AbortSignal,
  ) => Promise<void>;
  waitForApplicationBootstrap?: (
    runtime: CellRuntime,
    process: StartedProcess,
  ) => Promise<void>;
  write?: (message: string) => void;
  writeError?: (message: string) => void;
};

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

type ExecutionCellPhase =
  | "prepare"
  | "bootstrap"
  | "external-service"
  | "hydrate"
  | "start"
  | "attest"
  | "playwright"
  | "stop"
  | "server-diagnostics"
  | "cleanup"
  | "artifact-cleanup";

const formatFailureTree = (
  error: unknown,
  phases: ReadonlyMap<Error, ExecutionCellPhase>,
  fallbackPhase: ExecutionCellPhase,
): string => {
  return formatDiagnosticErrorTree(error, {
    resolveAnnotation: (current, inheritedAnnotation) => {
      const inheritedPhase = inheritedAnnotation?.startsWith("phase=")
        ? (inheritedAnnotation.slice("phase=".length) as ExecutionCellPhase)
        : fallbackPhase;
      const phase =
        current instanceof Error
          ? (phases.get(current) ?? inheritedPhase)
          : inheritedPhase;
      return `phase=${phase}`;
    },
  });
};

const cellImageIdentity = (input: ExecutionCellInput): string =>
  "imageId" in input ? input.imageId : "development";

const cellIdentity = (input: ExecutionCellInput): string =>
  `target=${input.target} browser=${input.browser}`;

const cellDuration = (startedAt: number): string =>
  `${Math.round(performance.now() - startedAt)}ms`;

const waitForAbortableDelay = async (
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> =>
  await new Promise<void>((resolveWait, rejectWait) => {
    if (signal.aborted) {
      rejectWait(abortReason(signal, "Execution cell"));
      return;
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolveWait();
    }, milliseconds);
    const abort = (): void => {
      clearTimeout(timeout);
      rejectWait(abortReason(signal, "Execution cell"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });

const terminateChildOnAbort = (
  child: ChildProcess,
  signal: AbortSignal,
): (() => void) => {
  const abort = (): void => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
    }
  };
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  const remove = (): void => signal.removeEventListener("abort", abort);
  child.once("close", remove);
  return remove;
};

export const isServerErrorDiagnostic = (event: unknown): boolean => {
  if (typeof event !== "object" || event === null) return false;
  const diagnostic = Reflect.get(event, "diagnostic");
  const candidate =
    typeof diagnostic === "object" && diagnostic !== null ? diagnostic : event;
  const context = Reflect.get(candidate, "context");
  return (
    Reflect.get(candidate, "version") === 1 &&
    (Reflect.get(candidate, "level") === "error" ||
      Reflect.get(candidate, "level") === "fatal") &&
    typeof context === "object" &&
    context !== null &&
    Reflect.get(context, "runtime") === "server"
  );
};

const attachServerDiagnostics = (
  child: ChildProcess,
  log: ReturnType<typeof createWriteStream>,
  diagnostics: Error[],
): Pick<StartedProcess, "drainLogs" | "forceDrainLogs"> => {
  const flushes: Array<() => void> = [];
  for (const stream of [child.stdout, child.stderr]) {
    let pending = "";
    const consume = (line: string): void => {
      try {
        const event: unknown = JSON.parse(line);
        if (isServerErrorDiagnostic(event))
          diagnostics.push(new Error(`server diagnostic: ${line}`));
      } catch {
        // Non-structured output remains available in the cell log artifact.
      }
    };
    stream?.on("data", (chunk: Buffer | string) => {
      const lines = `${pending}${chunk.toString()}`.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) consume(line);
    });
    stream?.pipe(log, { end: false });
    flushes.push(() => {
      if (pending !== "") {
        consume(pending);
        pending = "";
      }
    });
  }
  let ended = false;
  const endLog = (): void => {
    if (ended) return;
    ended = true;
    for (const stream of [child.stdout, child.stderr]) stream?.unpipe(log);
    for (const flush of flushes) flush();
    log.end();
  };
  const drained = new Promise<void>((resolveDrain, rejectDrain) => {
    child.once("close", endLog);
    log.once("finish", resolveDrain);
    log.once("error", rejectDrain);
  });
  return {
    drainLogs: async () => await drained,
    forceDrainLogs: endLog,
  };
};

export type AbortableCommandOptions = {
  outputPath?: string;
  signal?: AbortSignal;
  spawnProcess?: AbortableProcessSpawner;
  stdio?: "capture" | "inherit";
  terminationGraceMs?: number;
  timeoutMs?: number;
};

export type AbortableProcessSpawner = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => ChildProcess;

const abortReason = (signal: AbortSignal, label: string): Error =>
  toError(signal.reason ?? new Error(`${label} aborted`));

export type ManagedCommandOptions = AbortableCommandOptions & {
  cwd?: string;
  stdio?: "capture" | "inherit";
};

export type ManagedCommandResult = {
  stderr: string;
  stdout: string;
};

const childHasExited = (child: ChildProcess): boolean =>
  (child.exitCode !== null && child.exitCode !== undefined) ||
  (child.signalCode !== null && child.signalCode !== undefined);

const signalManagedProcessTree = (
  child: ChildProcess,
  signal: NodeJS.Signals,
): Error | undefined => {
  if (child.pid !== undefined && process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
      return undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
        return new Error(
          `Could not signal process group for ${String(child.pid)} with ${signal}: ${toError(error).message}`,
          { cause: error },
        );
      }
    }
  }
  try {
    if (child.kill(signal)) return undefined;
    return new Error(`Could not signal child process with ${signal}`);
  } catch (error) {
    return new Error(
      `Could not signal child process with ${signal}: ${toError(error).message}`,
      { cause: error },
    );
  }
};

const managedProcessGroupIsAlive = (child: ChildProcess): boolean => {
  if (child.pid === undefined || process.platform === "win32") return false;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
};

const managedChildIsAlive = (child: ChildProcess): boolean => {
  if (childHasExited(child)) return false;
  if (child.pid === undefined) return true;
  try {
    process.kill(child.pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
};

const managedProcessTreeIsAlive = (child: ChildProcess): boolean =>
  managedProcessGroupIsAlive(child) || managedChildIsAlive(child);

const waitForManagedProcessGroupExit = async (
  child: ChildProcess,
  label: string,
): Promise<void> => {
  const deadline = Date.now() + forcedProcessExitTimeoutMs;
  while (managedProcessGroupIsAlive(child)) {
    if (Date.now() >= deadline) {
      throw new Error(
        `Process group for ${label} remained alive after SIGKILL`,
      );
    }
    await new Promise<void>((resolveDelay) => {
      setTimeout(resolveDelay, 10);
    });
  }
};

const closeOutputStream = async (
  output: ReturnType<typeof createWriteStream> | undefined,
): Promise<Error | undefined> => {
  if (
    output === undefined ||
    output.writableFinished ||
    output.closed ||
    output.destroyed
  )
    return undefined;
  return await new Promise<Error | undefined>((resolveClose) => {
    const finish = (error?: Error): void => {
      output.removeListener("finish", finish);
      output.removeListener("error", fail);
      resolveClose(error);
    };
    const fail = (error: Error): void => finish(error);
    output.once("finish", finish);
    output.once("error", fail);
    output.end();
  });
};

export const runManagedCommand = async (
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  label: string,
  options: ManagedCommandOptions = {},
): Promise<ManagedCommandResult> =>
  await new Promise<ManagedCommandResult>((resolveRun, reject) => {
    if (options.signal?.aborted) {
      reject(abortReason(options.signal, label));
      return;
    }
    const output =
      options.outputPath === undefined
        ? undefined
        : createWriteStream(options.outputPath, { flags: "a" });
    let outputFailure: Error | undefined;
    let spawnedChild: ChildProcess | undefined;
    const failOutput = (error: Error): void => {
      outputFailure ??= new Error(
        `Could not write output for ${label}: ${error.message}`,
        { cause: error },
      );
      if (spawnedChild !== undefined) beginTermination(outputFailure);
    };
    output?.once("error", failOutput);
    const stdio =
      options.stdio ??
      (options.outputPath === undefined ? "inherit" : "capture");
    try {
      spawnedChild = (options.spawnProcess ?? spawn)(command, args, {
        cwd: options.cwd ?? root,
        detached: process.platform !== "win32",
        env: environment,
        stdio:
          stdio === "inherit"
            ? ["inherit", "inherit", "inherit"]
            : ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      output?.removeListener("error", failOutput);
      void closeOutputStream(output).then(() => reject(toError(error)));
      return;
    }
    const child = spawnedChild;
    let stdout = "";
    let stderr = "";
    let settled = false;
    let requestedFailure: Error | undefined;
    let closed:
      | { code: number | null; signal: NodeJS.Signals | null }
      | undefined;
    let terminationEscalated = false;
    let terminationTimeout: NodeJS.Timeout | undefined;
    const commandTimeout = setTimeout(() => {
      beginTermination(new Error(`Timed out during ${label}`));
    }, options.timeoutMs ?? startupTimeoutMs);
    const cleanup = (): void => {
      clearTimeout(commandTimeout);
      if (terminationTimeout !== undefined) clearTimeout(terminationTimeout);
      options.signal?.removeEventListener("abort", abort);
      output?.removeListener("error", failOutput);
      child.removeListener("error", failSpawn);
      child.removeListener("close", close);
    };
    const finish = async (
      code: number | null,
      closeSignal: NodeJS.Signals | null,
      failure = requestedFailure,
    ): Promise<void> => {
      if (settled) return;
      settled = true;
      cleanup();
      const closeFailure = await closeOutputStream(output);
      let processGroupExitFailure: Error | undefined;
      if (requestedFailure !== undefined && terminationEscalated) {
        try {
          await waitForManagedProcessGroupExit(child, label);
        } catch (error) {
          processGroupExitFailure = toError(error);
        }
      }
      const initialFailure =
        failure ?? requestedFailure ?? outputFailure ?? closeFailure;
      const finalFailure =
        initialFailure === undefined || processGroupExitFailure === undefined
          ? (initialFailure ?? processGroupExitFailure)
          : new AggregateError(
              [initialFailure, processGroupExitFailure],
              `Could not confirm ${label} stopped`,
            );
      if (finalFailure !== undefined) {
        reject(finalFailure);
        return;
      }
      if (code === 0) {
        resolveRun({ stderr, stdout });
        return;
      }
      const diagnostic = stderr.trim();
      reject(
        new Error(
          `${label} exited with ${closeSignal ?? String(code)}${
            options.outputPath === undefined
              ? diagnostic === ""
                ? ""
                : `: ${diagnostic}`
              : `; see ${options.outputPath}`
          }`,
        ),
      );
    };
    function beginTermination(failure: Error): void {
      requestedFailure ??= failure;
      const termFailure = signalManagedProcessTree(child, "SIGTERM");
      if (termFailure !== undefined) {
        void finish(
          null,
          null,
          new AggregateError(
            [requestedFailure, termFailure],
            `Could not terminate ${label}`,
          ),
        );
        return;
      }
      if (terminationTimeout !== undefined) return;
      terminationTimeout = setTimeout(() => {
        if (!managedProcessTreeIsAlive(child)) {
          void finish(closed?.code ?? null, closed?.signal ?? null);
          return;
        }
        terminationEscalated = true;
        const killFailure = signalManagedProcessTree(child, "SIGKILL");
        if (killFailure !== undefined) {
          if (!managedProcessTreeIsAlive(child)) {
            void finish(closed?.code ?? null, closed?.signal ?? null);
            return;
          }
          void finish(
            null,
            null,
            new AggregateError(
              [requestedFailure!, killFailure],
              `Could not force-stop ${label}`,
            ),
          );
          return;
        }
        if (closed !== undefined) void finish(closed.code, closed.signal);
      }, options.terminationGraceMs ?? processTerminationGraceMs);
    }
    const abort = (): void => {
      beginTermination(abortReason(options.signal!, label));
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    if (stdio === "capture") {
      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk: string) => {
        stderr += chunk;
      });
    }
    if (output !== undefined && stdio === "capture") {
      child.stdout?.pipe(output, { end: false });
      child.stderr?.pipe(output, { end: false });
    }
    function failSpawn(error: Error): void {
      void finish(null, null, error);
    }
    function close(
      code: number | null,
      closeSignal: NodeJS.Signals | null,
    ): void {
      if (
        requestedFailure !== undefined &&
        !terminationEscalated &&
        managedProcessGroupIsAlive(child)
      ) {
        closed = { code, signal: closeSignal };
        return;
      }
      void finish(code, closeSignal);
    }
    child.once("error", failSpawn);
    child.once("close", close);
    if (outputFailure !== undefined) beginTermination(outputFailure);
  });

export const runAbortableCommand = async (
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  label: string,
  options: AbortableCommandOptions = {},
): Promise<void> => {
  await runManagedCommand(command, args, environment, label, options);
};

type CellCommandRunner = (
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  label: string,
  outputPath?: string,
  signal?: AbortSignal,
  timeoutMs?: number,
) => Promise<void>;

const runCommand: CellCommandRunner = async (
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  label: string,
  outputPath?: string,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<void> =>
  await runAbortableCommand(command, args, environment, label, {
    ...(outputPath === undefined ? {} : { outputPath }),
    ...(signal === undefined ? {} : { signal }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });

const runCommandCapture = async (
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  label: string,
  outputPath?: string,
  signal?: AbortSignal,
): Promise<string> =>
  (
    await runManagedCommand(command, args, environment, label, {
      ...(outputPath === undefined ? {} : { outputPath }),
      ...(signal === undefined ? {} : { signal }),
      stdio: "capture",
    })
  ).stdout;

const clearRedisNamespace = async (
  url: string,
  namespace: string,
  signal: AbortSignal,
): Promise<void> => {
  const redis = createClient({ url });
  const abort = (): void => {
    redis.destroy();
  };
  if (signal.aborted) throw abortReason(signal, "Redis namespace cleanup");
  signal.addEventListener("abort", abort, { once: true });
  try {
    await redis.connect();
    const keys: string[] = [];
    for await (const batch of redis.scanIterator({
      MATCH: `${namespace}:*`,
    })) {
      if (signal.aborted) throw abortReason(signal, "Redis namespace cleanup");
      keys.push(...batch);
      while (keys.length >= 100) {
        if (signal.aborted)
          throw abortReason(signal, "Redis namespace cleanup");
        await Promise.all(
          keys.splice(0, 100).map(async (key) => await redis.del(key)),
        );
      }
    }
    if (keys.length > 0) {
      await Promise.all(keys.map(async (key) => await redis.del(key)));
    }
  } finally {
    signal.removeEventListener("abort", abort);
    redis.destroy();
  }
};

const reservePort = async (): Promise<number> => {
  const net = await import("node:net");
  return await new Promise<number>((resolvePort, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not reserve an E2E application port"));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolvePort(address.port);
      });
    });
  });
};

const quoteIdentifier = (value: string): string =>
  `"${value.replaceAll('"', '""')}"`;

const databaseUrlFor = (adminUrl: string, databaseName: string): string => {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
};

const formatUrlHost = (host: string): string =>
  host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;

const createCellDatabase = async (
  adminUrl: string,
): Promise<{ databaseName: string; databaseUrl: string }> => {
  const databaseName = `cat_e2e_cell_${randomUUID().replaceAll("-", "")}`;
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  } finally {
    await client.end();
  }
  const databaseUrl = databaseUrlFor(adminUrl, databaseName);
  const databaseClient = new Client({ connectionString: databaseUrl });
  await databaseClient.connect();
  try {
    await databaseClient.query(
      await readFile(searchRuntimeInitializationPath, "utf8"),
    );
  } finally {
    await databaseClient.end();
  }
  return { databaseName, databaseUrl };
};

export const dropCellDatabase = async (
  adminUrl: string,
  databaseName: string,
  signal: AbortSignal,
  client: Pick<Client, "connect" | "end" | "query"> = new Client({
    connectionString: adminUrl,
  }),
): Promise<void> => {
  let ending: Promise<void> | undefined;
  const closeClient = (): Promise<void> => {
    ending ??= Promise.resolve().then(async () => await client.end());
    return ending;
  };
  const abort = (): void => {
    void closeClient().catch(() => undefined);
  };
  if (signal.aborted) throw abortReason(signal, "Database cleanup");
  signal.addEventListener("abort", abort, { once: true });
  try {
    await client.connect();
    if (signal.aborted) throw abortReason(signal, "Database cleanup");
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [databaseName],
    );
    if (signal.aborted) throw abortReason(signal, "Database cleanup");
    await client.query(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`,
    );
  } finally {
    signal.removeEventListener("abort", abort);
    await closeClient();
  }
};

const readProcessIdentity = async (
  pid: number,
): Promise<ProcessIdentity | undefined> => {
  const { readFile } = await import("node:fs/promises");
  try {
    const [stat, command] = await Promise.all([
      readFile(`/proc/${pid}/stat`, "utf8"),
      readFile(`/proc/${pid}/cmdline`, "utf8"),
    ]);
    // /proc/<pid>/stat field 22 is starttime. The command can contain spaces,
    // so find its final parenthesis before counting subsequent fields.
    const afterCommand = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    const startTime = afterCommand[19];
    if (startTime === undefined) return undefined;
    return { command, startTime };
  } catch {
    return undefined;
  }
};

export const processIdentityMatches = (
  expected: ProcessIdentity | undefined,
  actual: ProcessIdentity | undefined,
): boolean =>
  actual !== undefined &&
  expected !== undefined &&
  actual.command === expected.command &&
  actual.startTime === expected.startTime;

const sameProcess = async (
  pid: number,
  expected: ProcessIdentity | undefined,
): Promise<boolean> => {
  if (expected === undefined) return false;
  const actual = await readProcessIdentity(pid);
  return processIdentityMatches(expected, actual);
};

const signalOwnedProcesses = async (
  started: StartedProcess,
  signal: NodeJS.Signals,
): Promise<void> => {
  if (started.child.pid !== undefined) {
    for (const pid of await descendantsOf(started.child.pid)) {
      started.ownedPids.add(pid);
      const identity = await readProcessIdentity(pid);
      if (identity !== undefined) started.processIdentities.set(pid, identity);
    }
  }
  for (const pid of [...started.ownedPids].reverse()) {
    if (!(await sameProcess(pid, started.processIdentities.get(pid)))) continue;
    try {
      process.kill(pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
};

type ChildExitWait = "aborted" | "closed" | "timed-out";

const waitForExit = async (
  child: ChildProcess,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ChildExitWait> =>
  await new Promise((resolveExit) => {
    if (childHasExited(child)) {
      resolveExit("closed");
      return;
    }
    let settled = false;
    const finish = (result: ChildExitWait): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.removeListener("close", close);
      signal?.removeEventListener("abort", abort);
      resolveExit(result);
    };
    const close = (): void => finish("closed");
    const abort = (): void => finish("aborted");
    const timeout = setTimeout(() => finish("timed-out"), timeoutMs);
    child.once("close", close);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });

const waitForPromise = async (
  promise: Promise<void>,
  timeoutMs: number,
): Promise<boolean> =>
  await new Promise<boolean>((resolveWait) => {
    let settled = false;
    const finish = (result: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveWait(result);
    };
    const timeout = setTimeout(() => finish(false), timeoutMs);
    void promise.then(
      () => finish(true),
      () => finish(true),
    );
  });

export type StopStartedProcessOptions = {
  callbackSettlementTimeoutMs?: number;
  callbackTimeoutMs?: number;
  drainTimeoutMs?: number;
  forceExitTimeoutMs?: number;
  forceStop: (signal: AbortSignal) => Promise<void>;
  gracefulStop: (signal: AbortSignal) => Promise<void>;
  gracefulTimeoutMs?: number;
  signal: AbortSignal;
};

const runBoundedStopCallback = async (
  label: string,
  callback: (signal: AbortSignal) => Promise<void>,
  timeoutMs: number,
  settlementTimeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<Error | undefined> => {
  const controller = new AbortController();
  const signal =
    parentSignal === undefined
      ? controller.signal
      : AbortSignal.any([controller.signal, parentSignal]);
  const operation = (async () => {
    try {
      await callback(signal);
      return { status: "fulfilled" } as const;
    } catch (error) {
      return { error, status: "rejected" } as const;
    }
  })();
  let softTimeout: NodeJS.Timeout | undefined;
  let resolveSoftTimeout: (() => void) | undefined;
  const softDeadline = new Promise<"soft-timeout">((resolveTimeout) => {
    resolveSoftTimeout = () => resolveTimeout("soft-timeout");
    softTimeout = setTimeout(resolveSoftTimeout, timeoutMs);
  });
  const abort = (): void => resolveSoftTimeout?.();
  if (parentSignal?.aborted) abort();
  else parentSignal?.addEventListener("abort", abort, { once: true });
  const softOutcome = await Promise.race([operation, softDeadline]);
  if (softTimeout !== undefined) clearTimeout(softTimeout);
  parentSignal?.removeEventListener("abort", abort);
  if (softOutcome !== "soft-timeout") {
    return softOutcome.status === "rejected"
      ? new Error(`${label} failed: ${toError(softOutcome.error).message}`, {
          cause: softOutcome.error,
        })
      : undefined;
  }
  const softFailure = new Error(
    parentSignal?.aborted
      ? `${label} was aborted`
      : `${label} timed out after ${timeoutMs}ms`,
  );
  controller.abort(softFailure);
  let hardTimeout: NodeJS.Timeout | undefined;
  const hardDeadline = new Promise<"hard-timeout">((resolveTimeout) => {
    hardTimeout = setTimeout(
      () => resolveTimeout("hard-timeout"),
      settlementTimeoutMs,
    );
  });
  const hardOutcome = await Promise.race([operation, hardDeadline]);
  if (hardTimeout !== undefined) clearTimeout(hardTimeout);
  if (hardOutcome === "hard-timeout") {
    return new Error(
      `${label} did not settle within ${settlementTimeoutMs}ms after cancellation`,
      { cause: softFailure },
    );
  }
  return new Error(`${label} exceeded its ${timeoutMs}ms deadline`, {
    cause: hardOutcome.status === "rejected" ? hardOutcome.error : softFailure,
  });
};

export const stopStartedProcess = async (
  started: StartedProcess,
  options: StopStartedProcessOptions,
): Promise<void> => {
  let gracefulFailure: unknown;
  let forceFailure: unknown;
  let mustForce = options.signal.aborted;
  if (!mustForce) {
    gracefulFailure = await runBoundedStopCallback(
      `${redactDiagnosticText(started.label)} graceful stop`,
      options.gracefulStop,
      options.callbackTimeoutMs ?? cleanupTimeoutMs,
      options.callbackSettlementTimeoutMs ?? cleanupSettlementTimeoutMs,
      options.signal,
    );
    mustForce = gracefulFailure !== undefined || options.signal.aborted;
  }
  if (!mustForce) {
    const result = await waitForExit(
      started.child,
      options.gracefulTimeoutMs ?? cleanupTimeoutMs,
      options.signal,
    );
    mustForce = result !== "closed";
  }
  if (mustForce) {
    forceFailure = await runBoundedStopCallback(
      `${redactDiagnosticText(started.label)} force stop`,
      options.forceStop,
      options.callbackTimeoutMs ?? cleanupTimeoutMs,
      options.callbackSettlementTimeoutMs ?? cleanupSettlementTimeoutMs,
    );
    const result = await waitForExit(
      started.child,
      options.forceExitTimeoutMs ?? forcedProcessExitTimeoutMs,
    );
    if (result !== "closed") {
      throw new Error(`Could not force-stop ${started.label}`);
    }
  }
  if (started.drainLogs !== undefined) {
    const drain = started.drainLogs();
    if (
      !(await waitForPromise(
        drain,
        options.drainTimeoutMs ?? logDrainTimeoutMs,
      ))
    ) {
      started.forceDrainLogs?.();
      if (
        !(await waitForPromise(
          drain,
          options.forceExitTimeoutMs ?? forcedProcessExitTimeoutMs,
        ))
      ) {
        throw new Error(`Could not drain logs for ${started.label}`);
      }
    }
    await drain;
  }
  if (forceFailure !== undefined) throw forceFailure;
  if (gracefulFailure !== undefined) throw gracefulFailure;
  if (options.signal.aborted) throw abortReason(options.signal, started.label);
};

const descendantsOf = async (pid: number): Promise<Set<number>> => {
  const { readFile } = await import("node:fs/promises");
  const seen = new Set<number>([pid]);
  const pending = [pid];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    try {
      const children = (
        await readFile(`/proc/${current}/task/${current}/children`, "utf8")
      )
        .trim()
        .split(/\s+/)
        .filter((value) => value !== "")
        .map(Number)
        .filter(Number.isInteger);
      for (const child of children) {
        if (!seen.has(child)) {
          seen.add(child);
          pending.push(child);
        }
      }
    } catch {
      // A child can exit while its process tree is being inspected.
    }
  }
  return seen;
};

const listenerInodes = async (port: number): Promise<Set<string>> => {
  const { readFile } = await import("node:fs/promises");
  const target = port.toString(16).toUpperCase().padStart(4, "0");
  const inodes = new Set<string>();
  for (const path of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    try {
      const lines = (await readFile(path, "utf8")).trim().split("\n").slice(1);
      for (const line of lines) {
        const columns = line.trim().split(/\s+/);
        const local = columns[1];
        const state = columns[3];
        const inode = columns[9];
        if (local?.endsWith(`:${target}`) && state === "0A" && inode) {
          inodes.add(inode);
        }
      }
    } catch {
      // Linux procfs is required by the E2E executor image but individual files
      // may be unavailable on constrained developer hosts.
    }
  }
  return inodes;
};

const pidOwnsListener = async (
  pid: number,
  listenerInodeSet: ReadonlySet<string>,
): Promise<boolean> => {
  const { readdir, readlink } = await import("node:fs/promises");
  for (const candidate of await descendantsOf(pid)) {
    try {
      const fds = await readdir(`/proc/${candidate}/fd`);
      for (const fd of fds) {
        try {
          const link = await readlink(`/proc/${candidate}/fd/${fd}`);
          const inode = /^socket:\[(\d+)]$/.exec(link)?.[1];
          if (inode && listenerInodeSet.has(inode)) return true;
        } catch {
          // File descriptors can disappear during process inspection.
        }
      }
    } catch {
      // Descendants that already exited cannot own the current listener.
    }
  }
  return false;
};

const waitForReadiness = async (
  runtime: CellRuntime,
  process: StartedProcess,
  signal: AbortSignal,
): Promise<unknown> => {
  const url = `${runtime.applicationUrl}/_health/ready`;
  const deadline = Date.now() + startupTimeoutMs;
  let lastFailure = "not attempted";
  while (Date.now() < deadline) {
    if (signal.aborted) throw abortReason(signal, "Readiness wait");
    if (process.child.exitCode !== null || process.child.signalCode !== null) {
      throw new Error(`${process.label} exited before readiness`);
    }
    try {
      const response = await fetch(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
      });
      const body: unknown = await response.json();
      if (response.ok) return body;
      lastFailure = `${response.status} ${JSON.stringify(body)}`;
    } catch (error) {
      if (signal.aborted) throw abortReason(signal, "Readiness wait");
      lastFailure = toError(error).message;
    }
    await waitForAbortableDelay(300, signal);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastFailure}`);
};

const waitForApplicationBootstrap = async (
  runtime: CellRuntime,
  process: StartedProcess,
  signal: AbortSignal,
): Promise<void> => {
  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    if (signal.aborted) throw abortReason(signal, "Application bootstrap");
    if (process.child.exitCode !== null || process.child.signalCode !== null) {
      throw new Error(`${process.label} exited during application bootstrap`);
    }
    try {
      const response = await fetch(runtime.applicationUrl, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
      });
      if (response.status < 500) return;
    } catch {
      if (signal.aborted) throw abortReason(signal, "Application bootstrap");
      // The Vite listener can start before Vike has installed its server hook.
    }
    await waitForAbortableDelay(300, signal);
  }
  throw new Error("Timed out waiting for ordinary application bootstrap");
};

const createServiceBootstrapPlan = (
  spacyUrl: string,
  storageDirectory: string,
): string =>
  JSON.stringify({
    idempotencyKey: `e2e-cell-${randomUUID()}`,
    operations: [
      {
        pluginId: "local-storage-provider",
        scopeId: "",
        scopeType: "GLOBAL",
        type: "install-if-absent",
        value: { "root-path": storageDirectory },
      },
      {
        pluginId: "spacy-segmenter",
        scopeId: "",
        scopeType: "GLOBAL",
        type: "install-if-absent",
        value: { serverUrl: spacyUrl },
      },
    ],
    version: "1",
  });

const createLoopbackProxy = async (runtime: CellRuntime): Promise<Disposer> => {
  const sockets = new Set<Socket>();
  const server: Server = createServer((client) => {
    sockets.add(client);
    const upstream = createConnection({
      host: runtime.applicationBindHost,
      port: runtime.applicationPort,
    });
    sockets.add(upstream);
    const close = (): void => {
      client.destroy();
      upstream.destroy();
      sockets.delete(client);
      sockets.delete(upstream);
    };
    client.once("error", close);
    upstream.once("error", close);
    client.once("close", () => sockets.delete(client));
    upstream.once("close", () => sockets.delete(upstream));
    client.pipe(upstream);
    upstream.pipe(client);
  });
  await new Promise<void>((resolveListen, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(
        new Error(`Timed out starting cell loopback proxy on ${runtime.port}`),
      );
    }, 5_000);
    server.once("error", (error) => {
      clearTimeout(timeout);
      reject(
        new Error(`Could not start cell loopback proxy: ${error.message}`),
      );
    });
    server.listen({ host: "127.0.0.1", port: runtime.port }, () => {
      clearTimeout(timeout);
      resolveListen();
    });
  });
  return async (signal) => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolveClose, reject) => {
      const abort = (): void => {
        server.close();
        reject(abortReason(signal, "Cell loopback proxy cleanup"));
      };
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
      server.close((error) => {
        signal.removeEventListener("abort", abort);
        if (
          error &&
          (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
        ) {
          reject(error);
        } else resolveClose();
      });
    });
  };
};

const assertReadiness = (
  report: unknown,
  expectedProfile: "lite" | "production",
): void => {
  if (typeof report !== "object" || report === null || Array.isArray(report)) {
    throw new Error("Readiness response is not an object");
  }
  const profile = Reflect.get(report, "profile");
  const status = Reflect.get(report, "status");
  const runtime = Reflect.get(report, "runtime");
  const components = Reflect.get(report, "components");
  if (profile !== expectedProfile || status !== "ready") {
    throw new Error(
      `Expected ready ${expectedProfile} runtime, received ${JSON.stringify(report)}`,
    );
  }
  if (
    typeof runtime !== "object" ||
    runtime === null ||
    Array.isArray(runtime)
  ) {
    throw new Error("Readiness response does not expose a runtime policy");
  }
  const expectedRuntime = {
    cacheBackend: expectedProfile === "lite" ? "memory" : "redis",
    queueBackend: expectedProfile === "lite" ? "memory" : "redis",
    requiredSearchLevel: "full-search-runtime",
    sessionBackend: expectedProfile === "lite" ? "memory" : "redis",
  };
  for (const [key, value] of Object.entries(expectedRuntime)) {
    if (Reflect.get(runtime, key) !== value) {
      throw new Error(`Readiness runtime ${key} is not ${value}`);
    }
  }
  if (
    typeof components !== "object" ||
    components === null ||
    Array.isArray(components)
  ) {
    throw new Error("Readiness response has no component report");
  }
  const requiredComponents = [
    "bootstrap",
    "runtime",
    "postgres",
    "search",
    "cache",
    "session",
    "queue",
    "storage",
    "spacy",
    ...(expectedProfile === "production" ? ["redis"] : []),
  ];
  for (const id of requiredComponents) {
    const component = Reflect.get(components, id);
    if (
      typeof component !== "object" ||
      component === null ||
      Reflect.get(component, "status") !== "ready"
    ) {
      throw new Error(`Readiness component ${id} is not ready`);
    }
  }
};

export const developmentRuntimeEnvironment = (
  runtime: CellRuntime,
  attempt: "bootstrap" | "validation",
): NodeJS.ProcessEnv => ({
  ...runtime.environment,
  CAT_DEV_DB_PUSH: "true",
  CAT_E2E_VITE_CACHE_DIR: join(runtime.probeWorkspace.cacheDirectory, attempt),
});

export const playwrightChildEnvironment = (
  environment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv => {
  const childEnvironment = { ...environment };
  if ("NO_COLOR" in childEnvironment) {
    delete childEnvironment.NO_COLOR;
    childEnvironment.FORCE_COLOR = "0";
  }
  return childEnvironment;
};

export class DevTargetAdapter implements TargetAdapter {
  private readonly run: CellCommandRunner;
  private readonly signal: AbortSignal;

  public constructor(signal: AbortSignal, run: CellCommandRunner = runCommand) {
    this.signal = signal;
    this.run = run;
  }

  public async prepare(runtime: CellRuntime): Promise<void> {
    // The development cell owns its bootstrap CLI build. This keeps direct dev
    // validation independent from a preceding production application build.
    await this.run(
      "pnpm",
      ["--filter", "@cat/app", "build:bootstrap-only"],
      runtime.environment,
      "development bootstrap CLI preparation",
      join(runtime.artifactDirectory, "bootstrap-cli-build.log"),
      this.signal,
    );
  }

  public async applyExternalServicePlan(runtime: CellRuntime): Promise<void> {
    await this.run(
      "pnpm",
      ["--filter", "@cat/app", "bootstrap-only"],
      {
        ...runtime.environment,
        CAT_BOOTSTRAP_PLAN: createServiceBootstrapPlan(
          runtime.environment.SPACY_SERVER_URL ?? "",
          runtime.storageDirectory,
        ),
      },
      "development external service plan",
      join(runtime.artifactDirectory, "external-service-plan.log"),
      this.signal,
    );
  }

  public async bootstrap(runtime: CellRuntime): Promise<void> {
    const bootstrap = await this.start(runtime, "bootstrap");
    try {
      await waitForApplicationBootstrap(runtime, bootstrap, this.signal);
    } finally {
      await this.stop(bootstrap);
    }
  }

  public async start(
    runtime: CellRuntime,
    attempt: "bootstrap" | "validation",
  ): Promise<StartedProcess> {
    const log = createWriteStream(
      join(runtime.artifactDirectory, `${attempt}-dev.log`),
      { flags: "a" },
    );
    const child = spawn(
      "pnpm",
      [
        "--filter",
        "@cat/app",
        "dev",
        "--",
        "--host",
        "127.0.0.1",
        "--port",
        String(runtime.port),
        "--force",
      ],
      {
        cwd: root,
        env: developmentRuntimeEnvironment(runtime, attempt),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    terminateChildOnAbort(child, this.signal);
    const started: StartedProcess = {
      child,
      diagnostics: [],
      label: `development ${attempt} server`,
      ownedPids: new Set(child.pid === undefined ? [] : [child.pid]),
      processIdentities: new Map(),
    };
    Object.assign(
      started,
      attachServerDiagnostics(child, log, started.diagnostics),
    );
    if (child.pid !== undefined) {
      void readProcessIdentity(child.pid).then((identity) => {
        if (identity !== undefined)
          started.processIdentities.set(child.pid!, identity);
      });
    }
    return started;
  }

  public async attest(
    runtime: CellRuntime,
    process: StartedProcess,
  ): Promise<void> {
    // Vike initializes the server entry on the first rendered page. A health
    // endpoint alone must not be allowed to validate an uninitialized runtime.
    await waitForApplicationBootstrap(runtime, process, this.signal);
    const report = await waitForReadiness(runtime, process, this.signal);
    const inodes = await listenerInodes(runtime.port);
    if (process.child.pid !== undefined) {
      for (const pid of await descendantsOf(process.child.pid)) {
        process.ownedPids.add(pid);
        const identity = await readProcessIdentity(pid);
        if (identity !== undefined)
          process.processIdentities.set(pid, identity);
      }
    }
    const ownsListener = (
      await Promise.all(
        [...process.ownedPids].map(
          async (pid) => await pidOwnsListener(pid, inodes),
        ),
      )
    ).some(Boolean);
    if (inodes.size === 0 || !ownsListener) {
      throw new Error(`Port ${runtime.port} is not owned by ${process.label}`);
    }
    assertReadiness(report, "lite");
  }

  public async stop(
    started: StartedProcess,
    signal?: AbortSignal,
  ): Promise<void> {
    const cleanupSignal = signal ?? this.signal;
    await stopStartedProcess(started, {
      forceStop: async () => await signalOwnedProcesses(started, "SIGKILL"),
      gracefulStop: async () => await signalOwnedProcesses(started, "SIGTERM"),
      signal: cleanupSignal,
    });
    await signalOwnedProcesses(started, "SIGKILL");
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    const survivors = await Promise.all(
      [...started.ownedPids].map(
        async (pid) =>
          await sameProcess(pid, started.processIdentities.get(pid)),
      ),
    );
    if (survivors.some(Boolean))
      throw new Error(`Could not stop ${started.label}`);
  }
}

type DockerContainerInspection = {
  Config?: {
    Cmd?: unknown;
    Env?: unknown;
    Image?: unknown;
    Labels?: Record<string, unknown>;
  };
  HostConfig?: {
    PortBindings?: Record<string, Array<{ HostPort?: unknown }> | null>;
  };
  Image?: unknown;
  Mounts?: Array<{ Destination?: unknown; Name?: unknown; Type?: unknown }>;
  NetworkSettings?: { Networks?: Record<string, unknown> };
  State?: {
    Error?: unknown;
    ExitCode?: unknown;
    OOMKilled?: unknown;
    Running?: unknown;
  };
};

type OneShotPreparerAttestation = {
  command: "bootstrap-only" | "prepare-only";
  containerName: string;
  imageId: string;
  inspectedImage: string;
  releaseIdentity: string;
};

type OneShotPreparerAttestationInput = Omit<
  OneShotPreparerAttestation,
  "inspectedImage"
>;

export const persistOneShotPreparerAttestation = async (
  path: string,
  inspection: DockerContainerInspection,
  input: OneShotPreparerAttestationInput,
): Promise<OneShotPreparerAttestation> => {
  if (typeof inspection.Image !== "string") {
    throw new Error("Docker inspection does not expose an immutable image ID");
  }
  const attestation = {
    ...input,
    inspectedImage: inspection.Image,
  } satisfies OneShotPreparerAttestation;
  await writeFile(path, JSON.stringify(attestation, null, 2));
  return attestation;
};

const containerServiceUrl = (
  value: string,
  hostname: string,
  port: number,
): string => {
  const url = new URL(value);
  url.hostname = hostname;
  url.port = String(port);
  return url.toString();
};

const parseContainerInspection = (
  value: string,
  containerName: string,
): DockerContainerInspection => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`Docker returned invalid inspection for ${containerName}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Docker returned invalid inspection for ${containerName}`);
  }
  return parsed;
};

const inspectDockerContainer = (
  containerName: string,
  environment: NodeJS.ProcessEnv,
): DockerContainerInspection => {
  try {
    return parseContainerInspection(
      execFileSync(
        "docker",
        ["container", "inspect", "--format", "{{json .}}", containerName],
        {
          cwd: root,
          encoding: "utf8",
          env: environment,
          killSignal: "SIGTERM",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 5_000,
        },
      ),
      containerName,
    );
  } catch (error) {
    throw new Error(
      `Release container inspect phase failed for ${containerName}: ${toError(error).message}`,
    );
  }
};

export const formatDockerContainerPhaseFailure = (
  state: DockerContainerInspection["State"] | undefined,
  logs: string,
): string =>
  [
    `State.OOMKilled=${String(state?.OOMKilled)}`,
    `State.Error=${String(state?.Error)}`,
    `State.ExitCode=${String(state?.ExitCode)}`,
    `logs=${logs.trim() === "" ? "<empty>" : logs.trim()}`,
  ].join("; ");

const dockerContainerPhaseFailure = (
  containerName: string,
  environment: NodeJS.ProcessEnv,
  inspection?: DockerContainerInspection,
): string => {
  let state = inspection?.State;
  if (state === undefined) {
    try {
      state = inspectDockerContainer(containerName, environment).State;
    } catch (error) {
      return `container inspect unavailable: ${toError(error).message}; logs unavailable`;
    }
  }
  let logs: string;
  try {
    logs = execFileSync(
      "docker",
      ["container", "logs", "--tail", "200", containerName],
      {
        cwd: root,
        encoding: "utf8",
        env: environment,
        killSignal: "SIGTERM",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 5_000,
      },
    );
  } catch (error) {
    logs = `<unavailable: ${toError(error).message}>`;
  }
  return formatDockerContainerPhaseFailure(state, logs);
};

const waitForDockerContainerInspection = async (
  runtime: CellRuntime,
  process: StartedProcess,
  containerName: string,
  signal: AbortSignal,
): Promise<DockerContainerInspection> => {
  const deadline = Date.now() + startupTimeoutMs;
  let lastFailure = "not attempted";
  while (Date.now() < deadline) {
    if (signal.aborted)
      throw abortReason(signal, "Release container inspection");
    if (process.child.exitCode !== null || process.child.signalCode !== null) {
      throw new Error(
        `${process.label} exited before container attestation; ${dockerContainerPhaseFailure(containerName, runtime.environment)}`,
      );
    }
    try {
      const inspection = inspectDockerContainer(
        containerName,
        runtime.environment,
      );
      if (inspection.State?.Running === true) return inspection;
      lastFailure = "container has not entered the running state";
    } catch (error) {
      lastFailure = toError(error).message;
    }
    await waitForAbortableDelay(300, signal);
  }
  throw new Error(
    `Timed out waiting to inspect release container ${containerName}: ${lastFailure}`,
  );
};

class ReleaseTargetAdapter implements TargetAdapter {
  private readonly browser: ExecutionBrowser;
  private readonly imageId: string;
  private readonly preparerImageId: string;
  private artifactDirectory: string | undefined;
  private readonly plans = new Map<string, string>();
  private readonly containers = new Map<string, () => void>();
  private readonly preparerAttestations: OneShotPreparerAttestation[] = [];
  private preparerReleaseIdentity: string | undefined;
  private readonly registerDisposer: (
    label: string,
    disposer: Disposer,
  ) => () => void;
  private readonly signal: AbortSignal;
  private readonly target: "runtime" | "standalone";

  public constructor(
    target: "runtime" | "standalone",
    imageId: string,
    preparerImageId: string,
    browser: ExecutionBrowser,
    registerDisposer: (label: string, disposer: Disposer) => () => void,
    signal: AbortSignal,
  ) {
    this.target = target;
    this.imageId = imageId;
    this.preparerImageId = preparerImageId;
    this.browser = browser;
    this.registerDisposer = registerDisposer;
    this.signal = signal;
  }

  public async prepare(runtime: CellRuntime): Promise<void> {
    await this.runLifecycleCommand(runtime, "prepare-only", "prepare");
    if (this.target === "runtime") {
      await this.assertRuntimeRejectsLifecycleCommands(runtime);
    }
  }

  public async bootstrap(runtime: CellRuntime): Promise<void> {
    const first = await this.runBootstrapOnly(runtime, "first");
    if (first !== "applied") {
      throw new Error(
        `Expected first standalone bootstrap receipt to apply, got ${first}`,
      );
    }
    const repeated = await this.runBootstrapOnly(runtime, "repeat");
    if (repeated !== "noop") {
      throw new Error(
        `Expected repeated standalone bootstrap receipt to be idempotent, got ${repeated}`,
      );
    }
  }

  public async applyExternalServicePlan(): Promise<void> {
    // bootstrap-only receives the deployment plan so fixture hydration remains
    // between a stopped process and the final ordinary application start.
  }

  public async start(
    runtime: CellRuntime,
    attempt: "bootstrap" | "validation",
  ): Promise<StartedProcess> {
    if (attempt !== "validation") {
      throw new Error(
        "Release targets only serve HTTP during validation startup",
      );
    }
    const containerName = this.containerName(runtime, attempt);
    const log = createWriteStream(
      join(runtime.artifactDirectory, `${attempt}-${this.target}.log`),
      { flags: "a" },
    );
    await this.createContainer(
      runtime,
      containerName,
      this.target === "standalone" ? "prepare-and-start" : "start-only",
      this.target === "standalone" ? this.bootstrapPlan(runtime) : undefined,
      true,
    );
    const child = spawn("docker", ["start", "--attach", containerName], {
      cwd: root,
      env: runtime.environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    terminateChildOnAbort(child, this.signal);
    const started: StartedProcess = {
      child,
      containerName,
      diagnostics: [],
      environment: runtime.environment,
      label: `${this.target} ${attempt} container ${containerName}`,
      ownedPids: new Set(child.pid === undefined ? [] : [child.pid]),
      processIdentities: new Map(),
    };
    Object.assign(
      started,
      attachServerDiagnostics(child, log, started.diagnostics),
    );
    if (child.pid !== undefined) {
      void readProcessIdentity(child.pid).then((identity) => {
        if (identity !== undefined)
          started.processIdentities.set(child.pid!, identity);
      });
    }
    return started;
  }

  public async attest(
    runtime: CellRuntime,
    process: StartedProcess,
  ): Promise<void> {
    const containerName = this.containerName(runtime, "validation");
    const inspection = await waitForDockerContainerInspection(
      runtime,
      process,
      containerName,
      this.signal,
    );
    const port =
      inspection.HostConfig?.PortBindings?.["3000/tcp"]?.[0]?.HostPort;
    const expectedEnvironment = this.containerEnvironment(runtime);
    const environment = inspection.Config?.Env;
    const inspectedEnvironment = new Map<string, string>();
    if (Array.isArray(environment)) {
      for (const entry of environment) {
        if (typeof entry !== "string") continue;
        const separator = entry.indexOf("=");
        if (separator < 1) continue;
        inspectedEnvironment.set(
          entry.slice(0, separator),
          entry.slice(separator + 1),
        );
      }
    }
    const environmentMatches =
      inspectedEnvironment.size > 0 &&
      Object.entries(expectedEnvironment).every(
        ([key, value]) => inspectedEnvironment.get(key) === value,
      );
    const storageMounted =
      runtime.storageVolumeName !== undefined &&
      inspection.Mounts?.some(
        (mount) =>
          mount.Type === "volume" &&
          mount.Name === runtime.storageVolumeName &&
          mount.Destination === "/data/storage",
      );
    const serviceNetworkAttached =
      inspection.NetworkSettings?.Networks !== undefined &&
      runtime.serviceNetworkName in inspection.NetworkSettings.Networks;
    const releaseIdentity =
      inspection.Config?.Labels?.["org.opencontainers.image.version"];
    if (
      inspection.State?.Running !== true ||
      inspection.Image !== this.imageId ||
      inspection.Config?.Image !== this.imageId ||
      JSON.stringify(inspection.Config?.Cmd) !==
        JSON.stringify([
          this.target === "standalone" ? "prepare-and-start" : "start-only",
        ]) ||
      inspection.Config?.Labels?.["org.opencontainers.image.description"] !==
        (this.target === "standalone"
          ? "CAT standalone application with database preparation"
          : "CAT start-only application runtime") ||
      typeof releaseIdentity !== "string" ||
      releaseIdentity.trim() === "" ||
      (this.target === "runtime" &&
        this.preparerReleaseIdentity !== releaseIdentity) ||
      port !== String(runtime.applicationPort) ||
      !environmentMatches ||
      !storageMounted ||
      !serviceNetworkAttached
    ) {
      throw new Error(
        `${this.target} container ${containerName} does not attest the requested immutable image and production cell resources; ${dockerContainerPhaseFailure(containerName, runtime.environment, inspection)}`,
      );
    }
    await writeFile(
      join(runtime.artifactDirectory, "attestation.json"),
      JSON.stringify(
        {
          browser: this.browser,
          containerName,
          coordinates: {
            applicationPort: runtime.applicationPort,
            databaseName: runtime.databaseName,
            proxyPort: runtime.port,
            redisNamespace: runtime.redisNamespace,
            serviceNetworkName: runtime.serviceNetworkName,
            storageVolumeName: runtime.storageVolumeName,
          },
          imageId: this.imageId,
          inspectedImage: inspection.Image,
          preparerImageId: this.preparerImageId,
          preparerAttestations: this.preparerAttestations,
          releaseIdentity,
          preparerReleaseIdentity: this.preparerReleaseIdentity,
          runtimeInspectedImage:
            this.target === "runtime" ? inspection.Image : undefined,
          target: this.target,
        },
        null,
        2,
      ),
    );
    if (this.target === "runtime") {
      await runCommand(
        "docker",
        [
          "exec",
          containerName,
          "/bin/sh",
          "-ec",
          "test ! -e /app/.preparation && test ! -e /app/drizzle && test ! -e /app/scripts && test ! -e /app/dist/bootstrap-only && test ! -e /app/compose.yaml && test ! -e /app/compose.local.yaml && test ! -e /app/compose.services.yaml && test ! -e /app/Dockerfile",
        ],
        runtime.environment,
        "runtime lifecycle artifact attestation",
        join(runtime.artifactDirectory, "runtime-filesystem-attestation.log"),
        this.signal,
      );
    }
    const report = await waitForReadiness(runtime, process, this.signal);
    assertReadiness(report, "production");
  }

  public async stop(
    started: StartedProcess,
    signal?: AbortSignal,
  ): Promise<void> {
    const containerName = started.containerName;
    if (containerName === undefined) {
      throw new Error(
        `Could not determine container identity for ${started.label}`,
      );
    }
    const environment = started.environment ?? process.env;
    const cleanupSignal = signal ?? this.signal;
    await stopStartedProcess(started, {
      forceStop: async (forceSignal) => {
        try {
          await this.removeContainer(containerName, environment, forceSignal);
        } finally {
          if (!childHasExited(started.child)) started.child.kill("SIGKILL");
        }
      },
      gracefulStop: async (gracefulSignal) =>
        await this.removeContainer(containerName, environment, gracefulSignal),
      signal: cleanupSignal,
    });
  }

  private containerName(runtime: CellRuntime, attempt: string): string {
    return `cat-e2e-${this.target}-${runtime.databaseName.slice(-20)}-${attempt}`;
  }

  private bootstrapPlan(runtime: CellRuntime): string {
    const existing = this.plans.get(runtime.databaseName);
    if (existing !== undefined) return existing;
    const plan = createServiceBootstrapPlan(
      containerServiceUrl(
        runtime.environment.SPACY_SERVER_URL ?? "",
        "spacy",
        8000,
      ),
      "/data/storage",
    );
    this.plans.set(runtime.databaseName, plan);
    return plan;
  }

  private containerArguments(
    runtime: CellRuntime,
    containerName: string,
    plan?: string,
    publish = false,
  ): string[] {
    const environment = this.containerEnvironment(runtime, plan);
    return [
      "create",
      "--name",
      containerName,
      "--network",
      runtime.serviceNetworkName,
      "--mount",
      runtime.storageVolumeName === undefined
        ? `type=bind,src=${runtime.storageDirectory},dst=/data/storage`
        : `type=volume,src=${runtime.storageVolumeName},dst=/data/storage`,
      ...(publish
        ? [
            "--publish",
            `${runtime.applicationBindHost}:${runtime.applicationPort}:3000`,
          ]
        : []),
      ...Object.entries(environment).flatMap(([key, value]) => [
        "--env",
        `${key}=${value}`,
      ]),
    ];
  }

  private containerEnvironment(
    runtime: CellRuntime,
    plan?: string,
  ): Record<string, string> {
    return {
      CAT_CACHE_BACKEND: "redis",
      CAT_DIAGNOSTIC_NDJSON: "true",
      CAT_QUEUE_BACKEND: "redis",
      CAT_REDIS_NAMESPACE: runtime.redisNamespace,
      CAT_RUNTIME_PROFILE: "production",
      CAT_SESSION_BACKEND: "redis",
      DATABASE_URL: containerServiceUrl(
        runtime.databaseUrl,
        "postgresql",
        5432,
      ),
      PORT: "3000",
      REDIS_URL: containerServiceUrl(
        runtime.environment.REDIS_URL ?? "",
        "redis",
        6379,
      ),
      SPACY_SERVER_URL: containerServiceUrl(
        runtime.environment.SPACY_SERVER_URL ?? "",
        "spacy",
        8000,
      ),
      ...(plan === undefined ? {} : { CAT_BOOTSTRAP_PLAN: plan }),
    } satisfies Record<string, string>;
  }

  private async createContainer(
    runtime: CellRuntime,
    containerName: string,
    command:
      | "prepare-only"
      | "bootstrap-only"
      | "prepare-and-start"
      | "start-only",
    plan: string | undefined,
    publish: boolean,
    imageId = this.imageId,
  ): Promise<void> {
    this.artifactDirectory ??= runtime.artifactDirectory;
    const args = this.containerArguments(runtime, containerName, plan, publish);
    await runCommandCapture(
      "docker",
      [...args, imageId, command],
      runtime.environment,
      `create ${containerName}`,
      join(runtime.artifactDirectory, `${containerName}.log`),
      this.signal,
    );
    const unregister = this.registerDisposer(
      `release container ${containerName}`,
      async (signal) =>
        await this.removeContainer(containerName, runtime.environment, signal),
    );
    this.containers.set(containerName, unregister);
  }

  private async removeContainer(
    containerName: string,
    environment: NodeJS.ProcessEnv,
    signal: AbortSignal = this.signal,
  ): Promise<void> {
    await runCommand(
      "docker",
      ["rm", "-f", "-v", containerName],
      environment,
      `remove ${containerName}`,
      this.artifactDirectory === undefined
        ? undefined
        : join(this.artifactDirectory, `${containerName}.remove.log`),
      AbortSignal.any([signal, AbortSignal.timeout(cleanupTimeoutMs)]),
    );
    this.containers.get(containerName)?.();
    this.containers.delete(containerName);
  }

  private async runLifecycleCommand(
    runtime: CellRuntime,
    command: "prepare-only",
    attempt: "prepare",
  ): Promise<void> {
    await this.runOneShot(
      runtime,
      this.containerName(runtime, attempt),
      command,
      undefined,
      `${this.target} ${command}`,
      join(runtime.artifactDirectory, `${attempt}-${this.target}.log`),
    );
  }

  private async runBootstrapOnly(
    runtime: CellRuntime,
    attempt: "first" | "repeat",
  ): Promise<"applied" | "noop"> {
    const output = await this.runOneShot(
      runtime,
      this.containerName(runtime, attempt),
      "bootstrap-only",
      this.bootstrapPlan(runtime),
      `standalone bootstrap-only ${attempt}`,
      join(runtime.artifactDirectory, `${attempt}-bootstrap-only.log`),
    );
    for (const line of output.trim().split("\n").reverse()) {
      try {
        const receipt: unknown = JSON.parse(line);
        const status =
          typeof receipt === "object" && receipt !== null
            ? Reflect.get(receipt, "status")
            : undefined;
        if (status === "applied" || status === "noop") return status;
      } catch {
        // Server diagnostics and lifecycle output may surround the receipt.
      }
    }
    throw new Error(
      "Standalone bootstrap-only did not emit an idempotency receipt",
    );
  }

  private async runOneShot(
    runtime: CellRuntime,
    containerName: string,
    command: "prepare-only" | "bootstrap-only",
    plan: string | undefined,
    label: string,
    outputPath: string,
  ): Promise<string> {
    await this.createContainer(
      runtime,
      containerName,
      command,
      plan,
      false,
      this.preparerImageId,
    );
    try {
      await this.attestOneShotPreparer(runtime, containerName, command);
      return await runCommandCapture(
        "docker",
        ["start", "--attach", containerName],
        runtime.environment,
        label,
        outputPath,
        this.signal,
      );
    } finally {
      await this.removeContainer(containerName, runtime.environment);
    }
  }

  private async assertRuntimeRejectsLifecycleCommands(
    runtime: CellRuntime,
  ): Promise<void> {
    for (const command of [
      "prepare-only",
      "bootstrap-only",
      "prepare-and-start",
    ] as const) {
      const containerName = this.containerName(runtime, `runtime-${command}`);
      await this.createContainer(
        runtime,
        containerName,
        command,
        undefined,
        false,
        this.imageId,
      );
      try {
        await runCommandCapture(
          "docker",
          ["start", "--attach", containerName],
          runtime.environment,
          `runtime rejects ${command}`,
          join(runtime.artifactDirectory, `runtime-rejects-${command}.log`),
          this.signal,
        );
      } catch (error) {
        if (toError(error).message.includes("exited with 64")) continue;
        throw error;
      } finally {
        await this.removeContainer(containerName, runtime.environment);
      }
      throw new Error(`Runtime image accepted unsupported command ${command}`);
    }
  }

  private async attestOneShotPreparer(
    runtime: CellRuntime,
    containerName: string,
    command: "prepare-only" | "bootstrap-only",
  ): Promise<void> {
    const inspection = parseContainerInspection(
      await runCommandCapture(
        "docker",
        ["container", "inspect", "--format", "{{json .}}", containerName],
        runtime.environment,
        `inspect ${containerName}`,
        undefined,
        this.signal,
      ),
      containerName,
    );
    const releaseIdentity =
      inspection.Config?.Labels?.["org.opencontainers.image.version"];
    if (
      typeof inspection.Image !== "string" ||
      inspection.Image !== this.preparerImageId ||
      inspection.Config?.Image !== this.preparerImageId ||
      JSON.stringify(inspection.Config?.Cmd) !== JSON.stringify([command]) ||
      inspection.Config?.Labels?.["org.opencontainers.image.description"] !==
        "CAT standalone application with database preparation" ||
      typeof releaseIdentity !== "string" ||
      releaseIdentity.trim() === "" ||
      (this.preparerReleaseIdentity !== undefined &&
        this.preparerReleaseIdentity !== releaseIdentity)
    ) {
      throw new Error(
        `Standalone preparer ${containerName} does not attest its immutable image, release identity, and lifecycle capability`,
      );
    }
    this.preparerReleaseIdentity = releaseIdentity;
    const attestation = await persistOneShotPreparerAttestation(
      join(runtime.artifactDirectory, `${containerName}.attestation.json`),
      inspection,
      {
        command,
        containerName,
        imageId: this.preparerImageId,
        releaseIdentity,
      },
    );
    this.preparerAttestations.push(attestation);
  }
}

export class StandaloneTargetAdapter extends ReleaseTargetAdapter {
  public constructor(
    imageId: string,
    browser: ExecutionBrowser,
    registerDisposer: (label: string, disposer: Disposer) => () => void,
    signal: AbortSignal,
  ) {
    super("standalone", imageId, imageId, browser, registerDisposer, signal);
  }
}

class RuntimeTargetAdapter extends ReleaseTargetAdapter {
  public constructor(
    runtimeImageId: string,
    preparerImageId: string,
    browser: ExecutionBrowser,
    registerDisposer: (label: string, disposer: Disposer) => () => void,
    signal: AbortSignal,
  ) {
    super(
      "runtime",
      runtimeImageId,
      preparerImageId,
      browser,
      registerDisposer,
      signal,
    );
  }
}

const seedQaReviewWorkbench = async (
  db: DrizzleDB["client"],
  refs: RefResolver,
): Promise<void> => {
  const adminId = refs.getStringId("user:admin");
  const project = await executeCommand({ db }, createProject, {
    creatorId: adminId,
    description: "E2E QA review fixture",
    name: "E2E QA review",
  });
  const contentRoot = await executeCommand({ db }, createRootContentNode, {
    creatorId: adminId,
    projectId: project.id,
  });
  const file = await executeCommand({ db }, createContentNodeUnderParent, {
    boundaryType: "FILE",
    creatorId: adminId,
    displayLabel: "qa-review.json",
    exportRole: "FILE",
    importerId: "e2e",
    kind: "FILE",
    localOrder: 0,
    parentContentNodeId: contentRoot.id,
    projectId: project.id,
    sourceRootRef: "qa-review-root",
    stableSourceNodeRef: "qa-review-file",
  });
  const sourceStrings = await Promise.all(
    ["QA approval source", "QA rejection source"].map(async (value) => {
      const [row] = await db
        .insert(vectorizedString)
        .values({ languageId: "en", value })
        .returning({ id: vectorizedString.id });
      if (!row) throw new Error("Could not create QA fixture source string");
      return row.id;
    }),
  );
  const elementIds = await executeCommand({ db }, createElements, {
    data: sourceStrings.map((stringId, index) => ({
      importerId: "e2e",
      localOrder: index,
      primaryContentNodeId: file.id,
      projectId: project.id,
      sourceNodeRef: `qa-review-element-${index}`,
      sourceRootRef: "qa-review-root",
      stableSourceRef: `qa-review-element-${index}`,
      stringId,
    })),
  });
  if (elementIds.length !== 2 || elementIds.some((id) => id === undefined)) {
    throw new Error("Could not create QA fixture elements");
  }
  const strings = await Promise.all(
    ["QA approved candidate", "QA rejected candidate"].map(async (value) => {
      const [row] = await db
        .insert(vectorizedString)
        .values({ languageId: "zh-Hans", value })
        .returning({ id: vectorizedString.id });
      if (!row) throw new Error("Could not create QA fixture string");
      return row.id;
    }),
  );
  const translations = await executeCommand({ db }, createTranslations, {
    data: elementIds.map((translatableElementId, index) => ({
      stringId: strings[index]!,
      translatableElementId,
      translatorId: adminId,
    })),
  });
  if (
    translations.length !== 2 ||
    translations.some((id) => id === undefined)
  ) {
    throw new Error("Could not create QA fixture translations");
  }
  const qa = [
    {
      action: "BLOCK_APPROVAL" as const,
      id: translations[0]!,
      message: "Missing placeholder",
      riskScore: 100,
    },
    {
      action: "NEEDS_REVIEW" as const,
      id: translations[1]!,
      message: "Needs style review",
      riskScore: 60,
    },
  ];
  for (const [index, item] of qa.entries()) {
    const elementId = elementIds[index]!;
    await executeCommand({ db }, createQaReviewRunWithFindings, {
      branchId: null,
      elementId,
      findings: [
        {
          action: item.action,
          checkerServiceId: null,
          confidenceBasisPoints: 10_000,
          disposition: "OPEN",
          explanation: null,
          layer: "DETERMINISTIC",
          message: item.message,
          meta: null,
          qaResultItemId: null,
          riskScore: item.riskScore,
          ruleFamily: "e2e",
          ruleId: "e2e.qa",
          severity: item.action === "BLOCK_APPROVAL" ? "error" : "warning",
          sourceSpan: null,
          suggestedText: null,
          targetSpan: null,
        },
      ],
      layer: "DETERMINISTIC",
      projectId: project.id,
      riskScore: item.riskScore,
      status: "COMPLETED",
      summary: item.message,
      translationId: item.id,
    });
    await executeCommand({ db }, materializeQaReviewQueueItem, {
      branchId: null,
      elementId,
      languageId: "zh-Hans",
      projectId: project.id,
      translationId: item.id,
    });
  }
  refs.set("qa:project", project.id);
  refs.set("qa:element:approve", elementIds[0]!);
  refs.set("qa:element:reject", elementIds[1]!);
};

const seedQaReviewDeferTarget = async (
  db: DrizzleDB["client"],
  refs: RefResolver,
): Promise<void> => {
  const creatorId = refs.getStringId("user:admin");
  const project = await executeCommand({ db }, createProject, {
    creatorId,
    description: "E2E QA defer fixture",
    name: "E2E QA defer",
  });
  const root = await executeCommand({ db }, createRootContentNode, {
    creatorId,
    projectId: project.id,
  });
  const file = await executeCommand({ db }, createContentNodeUnderParent, {
    boundaryType: "FILE",
    creatorId,
    displayLabel: "qa-defer.json",
    exportRole: "FILE",
    importerId: "e2e",
    kind: "FILE",
    localOrder: 0,
    parentContentNodeId: root.id,
    projectId: project.id,
    sourceRootRef: "qa-defer-root",
    stableSourceNodeRef: "qa-defer-file",
  });
  const [source] = await db
    .insert(vectorizedString)
    .values({ languageId: "en", value: "QA deferred source" })
    .returning({ id: vectorizedString.id });
  if (!source) throw new Error("Could not create QA defer source string");
  const [elementId] = await executeCommand({ db }, createElements, {
    data: [
      {
        importerId: "e2e",
        localOrder: 0,
        primaryContentNodeId: file.id,
        projectId: project.id,
        sourceNodeRef: "qa-defer-element",
        sourceRootRef: "qa-defer-root",
        stableSourceRef: "qa-defer-element",
        stringId: source.id,
      },
    ],
  });
  if (elementId === undefined)
    throw new Error("Could not create QA defer element");
  const [translationString] = await db
    .insert(vectorizedString)
    .values({ languageId: "zh-Hans", value: "QA deferred candidate" })
    .returning({ id: vectorizedString.id });
  if (!translationString)
    throw new Error("Could not create QA defer translation string");
  const [translationId] = await executeCommand({ db }, createTranslations, {
    data: [
      {
        stringId: translationString.id,
        translatableElementId: elementId,
        translatorId: creatorId,
      },
    ],
  });
  if (translationId === undefined)
    throw new Error("Could not create QA defer translation");
  await executeCommand({ db }, createQaReviewRunWithFindings, {
    branchId: null,
    elementId,
    findings: [
      {
        action: "NEEDS_REVIEW",
        checkerServiceId: null,
        confidenceBasisPoints: 10_000,
        disposition: "OPEN",
        explanation: null,
        layer: "DETERMINISTIC",
        message: "Needs reviewer follow-up",
        meta: null,
        qaResultItemId: null,
        riskScore: 55,
        ruleFamily: "e2e",
        ruleId: "e2e.qa.defer",
        severity: "warning",
        sourceSpan: null,
        suggestedText: null,
        targetSpan: null,
      },
    ],
    layer: "DETERMINISTIC",
    projectId: project.id,
    riskScore: 55,
    status: "COMPLETED",
    summary: "Needs reviewer follow-up",
    translationId,
  });
  await executeCommand({ db }, materializeQaReviewQueueItem, {
    branchId: null,
    elementId,
    languageId: "zh-Hans",
    projectId: project.id,
    translationId,
  });
  refs.set("qa:project:defer", project.id);
  refs.set("qa:element:defer", elementId);
};

const seedBranchWorkspace = async (
  db: DrizzleDB["client"],
  refs: RefResolver,
): Promise<void> => {
  const pullRequest = await executeCommand({ db }, createPR, {
    authorId: refs.getStringId("user:admin"),
    body: "Branch workspace E2E fixture",
    branchName: "e2e/branch-workspace",
    projectId: refs.getStringId("project"),
    reviewers: [],
    title: "E2E branch workspace",
  });
  const opened = await executeCommand({ db }, updatePRStatus, {
    prId: pullRequest.id,
    status: "OPEN",
  });
  refs.set("pr:branch-workspace", opened.id);
  refs.set("pr:branch-workspace:number", opened.number);
  refs.set("branch:workspace", opened.branchId);
};

const hydrateFixtures = async (runtime: CellRuntime): Promise<void> => {
  const database = new DrizzleDB(runtime.databaseUrl);
  await database.connect();
  try {
    const seedDirectory = resolve(root, "tools/seeder/datasets/e2e");
    const result = await runFixtureHydration(
      { db: database.client },
      loadDevSeed(seedDirectory),
      {
        cacheDir: resolve(seedDirectory, "../../.vector-cache"),
        defaultPluginsJsonPath: resolve(root, "apps/app/default-plugins.json"),
        pluginsDir: resolve(root, "@cat-plugin"),
      },
    );
    await seedQaReviewWorkbench(database.client, result.refs);
    await seedQaReviewDeferTarget(database.client, result.refs);
    await seedBranchWorkspace(database.client, result.refs);
    const refs = Object.fromEntries(
      [...result.refs.entries()].map(([key, value]) => [key, String(value)]),
    );
    await writeFile(runtime.refsPath, JSON.stringify(refs, null, 2));
  } finally {
    await database.disconnect();
  }
};

const adapterFor = (
  input: ExecutionCellInput,
  registerDisposer: (label: string, disposer: Disposer) => () => void,
  signal: AbortSignal,
): TargetAdapter => {
  if (input.target === "dev") return new DevTargetAdapter(signal);
  if (input.target === "standalone") {
    return new StandaloneTargetAdapter(
      input.imageId,
      input.browser,
      registerDisposer,
      signal,
    );
  }
  return new RuntimeTargetAdapter(
    input.imageId,
    input.preparerImageId,
    input.browser,
    registerDisposer,
    signal,
  );
};

export class ExecutionCell {
  private artifactDirectory: string | undefined;
  private readonly dependencies: ExecutionCellDependencies;
  private readonly disposers: RegisteredDisposer[] = [];
  private readonly input: ExecutionCellInput;
  private readonly reportFatalFailure: (error: Error) => void;
  private readonly signal: AbortSignal;

  public constructor(
    input: ExecutionCellInput,
    dependencies: ExecutionCellDependencies = {},
    signal: AbortSignal = new AbortController().signal,
    reportFatalFailure: (error: Error) => void = () => undefined,
  ) {
    this.input = input;
    this.dependencies = dependencies;
    this.signal = signal;
    this.reportFatalFailure = reportFatalFailure;
  }

  public async run(): Promise<void> {
    const startedAt = performance.now();
    const write =
      this.dependencies.write ??
      ((message: string): void => {
        process.stdout.write(`${message}\n`);
      });
    const writeError =
      this.dependencies.writeError ??
      ((message: string): void => {
        process.stderr.write(`${message}\n`);
      });
    const identity = cellIdentity(this.input);
    write(
      `e2e cell ${identity} image=${cellImageIdentity(this.input)} status=started`,
    );
    let primaryFailure: unknown;
    let primaryFailurePhase: ExecutionCellPhase = "prepare";
    const failurePhases = new Map<Error, ExecutionCellPhase>();
    let runtime: CellRuntime | undefined;
    try {
      this.throwIfAborted();
      runtime =
        (await this.dependencies.createRuntime?.(this.register.bind(this))) ??
        (await this.createRuntime());
      this.artifactDirectory ??= runtime.artifactDirectory;
      this.throwIfAborted();
      const target =
        this.dependencies.createTarget?.(this.input) ??
        adapterFor(this.input, this.register.bind(this), this.signal);
      primaryFailurePhase = "prepare";
      await target.prepare(runtime);
      this.throwIfAborted();
      primaryFailurePhase = "bootstrap";
      await target.bootstrap(runtime);
      this.throwIfAborted();
      primaryFailurePhase = "external-service";
      await target.applyExternalServicePlan(runtime);
      this.throwIfAborted();
      primaryFailurePhase = "hydrate";
      await (this.dependencies.hydrateFixtures ?? hydrateFixtures)(runtime);
      this.throwIfAborted();
      primaryFailurePhase = "start";
      const validation = await target.start(runtime, "validation");
      const unregisterValidation = this.register(
        "validation application process",
        async (signal) => await target.stop(validation, signal),
      );
      if (this.input.target !== "dev") {
        this.register(
          "cell loopback proxy",
          await createLoopbackProxy(runtime),
        );
      }
      primaryFailurePhase = "attest";
      await target.attest(runtime, validation);
      this.throwIfAborted();
      let playwrightFailure: unknown;
      try {
        primaryFailurePhase = "playwright";
        await this.runPlaywright(runtime.environment);
      } catch (error) {
        playwrightFailure = error;
        failurePhases.set(toError(error), "playwright");
      }

      let stopFailure: unknown;
      try {
        primaryFailurePhase = "stop";
        await target.stop(validation);
        unregisterValidation();
      } catch (error) {
        stopFailure = error;
        failurePhases.set(toError(error), "stop");
      }
      primaryFailurePhase = "server-diagnostics";
      const serverFailure =
        validation.diagnostics.length === 0
          ? undefined
          : new AggregateError(
              validation.diagnostics,
              "Server emitted structured error diagnostics during browser validation",
            );
      if (serverFailure !== undefined) {
        failurePhases.set(serverFailure, "server-diagnostics");
        for (const diagnostic of validation.diagnostics) {
          failurePhases.set(diagnostic, "server-diagnostics");
        }
      }
      const validationFailures = [playwrightFailure, stopFailure, serverFailure]
        .filter(
          (failure): failure is NonNullable<typeof failure> =>
            failure !== undefined,
        )
        .map(toError);
      if (validationFailures.length === 1) {
        primaryFailurePhase =
          playwrightFailure !== undefined
            ? "playwright"
            : stopFailure !== undefined
              ? "stop"
              : "server-diagnostics";
        throw validationFailures[0];
      }
      if (validationFailures.length > 1) {
        primaryFailurePhase =
          playwrightFailure !== undefined
            ? "playwright"
            : stopFailure !== undefined
              ? "stop"
              : "server-diagnostics";
        throw new AggregateError(
          validationFailures,
          "Playwright validation, application shutdown, or server diagnostics failed",
        );
      }
    } catch (error) {
      primaryFailure = error;
      failurePhases.set(toError(error), primaryFailurePhase);
    }
    const cleanupFailures = await this.cleanup(writeError);
    const outputDirectory = runtime?.environment.CAT_E2E_OUTPUT_DIR;
    if (outputDirectory !== undefined) {
      try {
        await rm(join(outputDirectory, ".auth"), {
          force: true,
          recursive: true,
        });
      } catch (error) {
        const failure = toError(error);
        cleanupFailures.push(failure);
        failurePhases.set(failure, "artifact-cleanup");
      }
    }
    for (const failure of cleanupFailures) {
      if (!failurePhases.has(failure)) failurePhases.set(failure, "cleanup");
    }
    if (primaryFailure === undefined && cleanupFailures.length === 0) {
      try {
        await this.removeArtifacts();
        write(
          `e2e cell ${identity} result=passed duration=${cellDuration(startedAt)} cleanup=passed`,
        );
        return;
      } catch (error) {
        const failure = toError(error);
        cleanupFailures.push(failure);
        failurePhases.set(failure, "artifact-cleanup");
      }
    }
    const cleanup = cleanupFailures.length === 0 ? "passed" : "failed";
    const artifact = this.artifactDirectory ?? "<not-created>";
    write(
      `e2e cell ${identity} result=failed duration=${cellDuration(startedAt)} cleanup=${cleanup}`,
    );
    const cleanupFailureDetails = cleanupFailures
      .map((failure) => formatFailureTree(failure, failurePhases, "cleanup"))
      .join("; ");
    writeError(
      `e2e cell ${identity} result=failed artifact=${artifact} cleanup=${cleanup} failure=${
        primaryFailure === undefined
          ? cleanupFailureDetails
          : formatFailureTree(
              primaryFailure,
              failurePhases,
              primaryFailurePhase,
            )
      }${
        primaryFailure !== undefined && cleanupFailureDetails !== ""
          ? ` cleanup-failure=${cleanupFailureDetails}`
          : ""
      }`,
    );
    if (primaryFailure !== undefined && cleanupFailures.length > 0) {
      throw new AggregateError(
        [primaryFailure, ...cleanupFailures],
        "Execution cell validation and cleanup failed",
      );
    }
    if (primaryFailure !== undefined) throw primaryFailure;
    if (cleanupFailures.length > 0) {
      throw new AggregateError(
        cleanupFailures,
        "Execution cell cleanup failed",
      );
    }
  }

  private async createRuntime(): Promise<CellRuntime> {
    const cellId = randomUUID();
    await mkdir(e2eArtifactRoot, { recursive: true });
    const artifactDirectory = await mkdtemp(
      join(
        e2eArtifactRoot,
        `cat-e2e-${this.input.target}-${this.input.browser}-`,
      ),
    );
    this.artifactDirectory = artifactDirectory;
    const probeWorkspace = await createDevProbeWorkspace(root, cellId);
    this.register(
      "development probe workspace",
      async () => await removeDevProbeWorkspace(probeWorkspace),
    );
    const storageDirectory = join(artifactDirectory, "storage");
    await mkdir(storageDirectory, { recursive: true });
    await chmod(storageDirectory, 0o777);
    const outputDirectory = join(artifactDirectory, "playwright");
    await mkdir(outputDirectory, { recursive: true });
    const database = await createCellDatabase(
      this.input.lease.coordinates.databaseUrl,
    );
    this.register(
      "cell database",
      async (signal) =>
        await dropCellDatabase(
          this.input.lease.coordinates.databaseUrl,
          database.databaseName,
          signal,
        ),
    );
    const redisNamespace = `cat-e2e:${this.input.target}:${this.input.browser}:${cellId}`;
    this.register(
      "cell Redis namespace",
      async (signal) =>
        await clearRedisNamespace(
          this.input.lease.coordinates.redisUrl,
          redisNamespace,
          signal,
        ),
    );
    const storageVolumeName =
      this.input.target !== "dev" ? `cat-e2e-storage-${cellId}` : undefined;
    if (storageVolumeName !== undefined) {
      await runCommandCapture(
        "docker",
        ["volume", "create", storageVolumeName],
        process.env,
        `create ${storageVolumeName}`,
        join(artifactDirectory, `${storageVolumeName}.create.log`),
        this.signal,
      );
      this.register(
        "cell storage volume",
        async (signal) =>
          await runCommand(
            "docker",
            ["volume", "rm", storageVolumeName],
            process.env,
            `remove ${storageVolumeName}`,
            join(artifactDirectory, `${storageVolumeName}.remove.log`),
            AbortSignal.any([signal, AbortSignal.timeout(cleanupTimeoutMs)]),
          ),
      );
    }
    const port = await reservePort();
    const applicationPort =
      this.input.target !== "dev" ? await reservePort() : port;
    const applicationBindHost =
      this.input.target !== "dev"
        ? new URL(this.input.lease.coordinates.databaseUrl).hostname
        : "127.0.0.1";
    const baseUrl = `http://127.0.0.1:${port}`;
    const applicationUrl = `http://${formatUrlHost(applicationBindHost)}:${applicationPort}`;
    const environment = {
      ...process.env,
      CAT_CACHE_BACKEND: "memory",
      CAT_DIAGNOSTIC_NDJSON: "true",
      CAT_E2E_BASE_URL: baseUrl,
      CAT_E2E_HMR_PROBE_DIRECTORY: probeWorkspace.directory,
      CAT_E2E_OUTPUT_DIR: outputDirectory,
      CAT_E2E_REPORT_DIR: join(artifactDirectory, "playwright-report"),
      CAT_E2E_REFS_PATH: join(artifactDirectory, "e2e-refs.json"),
      CAT_QUEUE_BACKEND: "memory",
      CAT_REDIS_NAMESPACE: redisNamespace,
      CAT_RUNTIME_PROFILE: "lite",
      CAT_SESSION_BACKEND: "memory",
      DATABASE_URL: database.databaseUrl,
      PORT: String(port),
      REDIS_URL: this.input.lease.coordinates.redisUrl,
      SPACY_SERVER_URL: this.input.lease.coordinates.spacyUrl,
      VITE_E2E: "true",
    } satisfies NodeJS.ProcessEnv;
    return {
      applicationBindHost,
      applicationPort,
      applicationUrl,
      artifactDirectory,
      baseUrl,
      databaseName: database.databaseName,
      databaseUrl: database.databaseUrl,
      environment,
      port,
      probeWorkspace,
      redisNamespace,
      refsPath: environment.CAT_E2E_REFS_PATH,
      serviceNetworkName: `${this.input.lease.ownership.projectName}_default`,
      storageDirectory,
      ...(storageVolumeName === undefined ? {} : { storageVolumeName }),
    };
  }

  private async runPlaywright(environment: NodeJS.ProcessEnv): Promise<void> {
    if (this.dependencies.runPlaywright !== undefined) {
      await this.dependencies.runPlaywright(
        environment,
        this.input.target,
        this.input.browser,
        this.signal,
      );
      return;
    }
    await runCommand(
      "pnpm",
      [
        "exec",
        "playwright",
        "test",
        "--config",
        "apps/app-e2e/playwright.config.ts",
        "--project",
        `${this.input.target}-${this.input.browser}`,
      ],
      playwrightChildEnvironment(environment),
      `${this.input.target}-${this.input.browser} Playwright`,
      undefined,
      this.signal,
      playwrightTimeoutMs,
    );
  }

  private register(label: string, disposer: Disposer): () => void {
    const registered: RegisteredDisposer = {
      active: true,
      dispose: disposer,
      label,
    };
    this.disposers.push(registered);
    return () => {
      registered.active = false;
    };
  }

  private throwIfAborted(): void {
    if (this.signal.aborted) {
      throw abortReason(this.signal, "Execution cell");
    }
  }

  private async removeArtifacts(): Promise<void> {
    if (this.artifactDirectory === undefined) return;
    if (this.dependencies.removeArtifacts !== undefined) {
      await this.dependencies.removeArtifacts(this.artifactDirectory);
      return;
    }
    await rm(this.artifactDirectory, { force: true, recursive: true });
  }

  private async cleanup(
    writeError: (message: string) => void,
  ): Promise<Error[]> {
    const failures: Error[] = [];
    for (const disposer of this.disposers.reverse()) {
      if (!disposer.active) continue;
      const controller = new AbortController();
      const startedAt = performance.now();
      const label = redactDiagnosticText(disposer.label);
      let softFailure: Error | undefined;
      let hardTimeout: NodeJS.Timeout | undefined;
      let resolveHardTimeout: (() => void) | undefined;
      const hardDeadline = new Promise<"hard-timeout">((resolveHard) => {
        resolveHardTimeout = () => resolveHard("hard-timeout");
      });
      const softTimeout = setTimeout(() => {
        softFailure = new Error(
          `Execution cell cleanup timed out label=${label} duration=${cellDuration(startedAt)}`,
        );
        controller.abort(softFailure);
        writeError(
          `e2e cleanup label=${label} status=timed-out duration=${cellDuration(startedAt)} waiting=resource-settlement`,
        );
        hardTimeout = setTimeout(
          () => resolveHardTimeout?.(),
          this.dependencies.cleanupSettlementTimeoutMs ??
            cleanupSettlementTimeoutMs,
        );
      }, this.dependencies.cleanupTimeoutMs ?? cleanupTimeoutMs);
      const disposal = Promise.resolve()
        .then(async () => await disposer.dispose(controller.signal))
        .then(
          () => ({ status: "fulfilled" }) as const,
          (error: unknown) => ({ error, status: "rejected" }) as const,
        );
      const outcome = await Promise.race([disposal, hardDeadline]);
      clearTimeout(softTimeout);
      if (hardTimeout !== undefined) clearTimeout(hardTimeout);
      if (outcome === "hard-timeout") {
        const hardFailure = new Error(
          `Execution cell cleanup hard timeout label=${label} duration=${cellDuration(startedAt)}`,
        );
        writeError(
          `e2e cleanup label=${label} status=hard-timeout duration=${cellDuration(startedAt)}`,
        );
        this.reportFatalFailure(hardFailure);
        failures.push(hardFailure);
        // The transformed promise is rejection-handled. The matrix fails
        // closed, so no later cell starts after this last-resort breach.
        continue;
      }
      if (softFailure !== undefined) {
        failures.push(softFailure);
        continue;
      }
      if (outcome.status === "rejected") {
        const failure = toError(outcome.error);
        failures.push(
          new Error(
            `Execution cell cleanup failed label=${label} duration=${cellDuration(startedAt)}: ${failure.message}`,
            { cause: failure },
          ),
        );
      }
    }
    return failures;
  }
}

export type ScheduleOptions = {
  concurrency?: 1 | 2;
  createCell?: (
    input: ExecutionCellInput,
    reportFatalFailure: (error: Error) => void,
  ) => {
    run: (signal: AbortSignal) => Promise<void>;
  };
  retryFailedCells?: boolean;
  signal?: AbortSignal;
};

/**
 * Schedules isolated complete cells with bounded parallelism. A failed cell
 * prevents further dispatch while cells that already own resources finish and
 * clean up before the matrix result is reported.
 */
export const runExecutionCells = async (
  inputs: readonly ExecutionCellInput[],
  options: ScheduleOptions = {},
): Promise<ExecutionCellInput[]> => {
  const signal = options.signal ?? new AbortController().signal;
  const concurrency = options.concurrency ?? 2;
  if (concurrency !== 1 && concurrency !== 2) {
    throw new Error("Execution cell concurrency must be 1 or 2");
  }
  const failures: unknown[] = [];
  const completed: ExecutionCellInput[] = [];
  let nextInputIndex = 0;
  let stopped = signal.aborted;
  const stopScheduling = (): void => {
    stopped = true;
  };
  const createCell =
    options.createCell ??
    ((input: ExecutionCellInput, reportFatalFailure: (error: Error) => void) =>
      new ExecutionCell(input, {}, signal, reportFatalFailure));
  signal.addEventListener("abort", stopScheduling, { once: true });

  const runCell = async (input: ExecutionCellInput): Promise<void> => {
    try {
      await createCell(input, stopScheduling).run(signal);
    } catch (firstFailure) {
      if (!options.retryFailedCells) throw firstFailure;
      if (signal.aborted || stopped) throw firstFailure;
      try {
        // Creating a new ExecutionCell gives the retry fresh database, storage,
        // port, process, and artifact ownership rather than reusing failed state.
        await createCell(input, stopScheduling).run(signal);
      } catch (retryFailure) {
        throw new AggregateError(
          [firstFailure, retryFailure],
          "Execution cell failed after its explicit whole-cell retry",
        );
      }
    }
  };

  const worker = async (): Promise<void> => {
    while (!stopped) {
      const input = inputs[nextInputIndex];
      if (input === undefined) return;
      nextInputIndex += 1;
      try {
        await runCell(input);
        completed.push(input);
      } catch (error) {
        failures.push(error);
        stopped = true;
        return;
      }
    }
  };

  try {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, inputs.length) }, worker),
    );
  } finally {
    signal.removeEventListener("abort", stopScheduling);
  }
  if (signal.aborted) {
    const interruption = abortReason(signal, "Execution cell matrix");
    if (failures.length === 0) throw interruption;
    throw new AggregateError([interruption, ...failures], interruption.message);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      "Multiple execution cells failed while completing matrix diagnostics",
    );
  }
  return completed;
};
