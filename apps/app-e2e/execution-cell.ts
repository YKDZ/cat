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
  stop: (process: StartedProcess) => Promise<void>;
};

type Disposer = () => Promise<void>;

type RegisteredDisposer = {
  active: boolean;
  dispose: Disposer;
};

export type ExecutionCellDependencies = {
  createRuntime?: (
    register: (disposer: () => Promise<void>) => () => void,
  ) => Promise<CellRuntime>;
  createTarget?: (input: ExecutionCellInput) => TargetAdapter;
  hydrateFixtures?: (runtime: CellRuntime) => Promise<void>;
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
};

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

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
): (() => Promise<void>) => {
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
      if (pending !== "") consume(pending);
    });
  }
  const drained = new Promise<void>((resolveDrain, rejectDrain) => {
    child.once("close", () => {
      for (const flush of flushes) flush();
      log.end();
    });
    log.once("finish", resolveDrain);
    log.once("error", rejectDrain);
  });
  return async () => await drained;
};

export type AbortableCommandOptions = {
  outputPath?: string;
  signal?: AbortSignal;
  spawnProcess?: AbortableProcessSpawner;
};

export type AbortableProcessSpawner = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => ChildProcess;

const abortReason = (signal: AbortSignal, label: string): Error =>
  toError(signal.reason ?? new Error(`${label} aborted`));

export const runAbortableCommand = async (
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  label: string,
  options: AbortableCommandOptions = {},
): Promise<void> => {
  await new Promise<void>((resolveRun, reject) => {
    const output =
      options.outputPath === undefined
        ? undefined
        : createWriteStream(options.outputPath, { flags: "a" });
    if (options.signal?.aborted) {
      output?.end();
      reject(abortReason(options.signal, label));
      return;
    }
    const child = (options.spawnProcess ?? spawn)(command, args, {
      cwd: root,
      env: environment,
      stdio: output === undefined ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    let abortTimeout: NodeJS.Timeout | undefined;
    const finish = (failure?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (abortTimeout !== undefined) clearTimeout(abortTimeout);
      options.signal?.removeEventListener("abort", abort);
      output?.end();
      if (failure === undefined) resolveRun();
      else reject(failure);
    };
    const abort = (): void => {
      child.kill("SIGTERM");
      abortTimeout = setTimeout(
        () => finish(abortReason(options.signal!, label)),
        cleanupTimeoutMs,
      );
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error(`Timed out during ${label}`));
    }, startupTimeoutMs);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (output !== undefined) {
      child.stdout?.pipe(output, { end: false });
      child.stderr?.pipe(output, { end: false });
    }
    child.once("error", (error) => {
      finish(
        options.signal?.aborted ? abortReason(options.signal, label) : error,
      );
    });
    child.once("close", (code, signal) => {
      if (options.signal?.aborted) {
        finish(abortReason(options.signal, label));
      } else if (code === 0) {
        finish();
      } else {
        finish(
          new Error(
            `${label} exited with ${signal ?? String(code)}${
              options.outputPath === undefined
                ? ""
                : `; see ${options.outputPath}`
            }`,
          ),
        );
      }
    });
  });
};

type CellCommandRunner = (
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  label: string,
  outputPath?: string,
  signal?: AbortSignal,
) => Promise<void>;

const runCommand: CellCommandRunner = async (
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  label: string,
  outputPath?: string,
  signal?: AbortSignal,
): Promise<void> =>
  await runAbortableCommand(command, args, environment, label, {
    ...(outputPath === undefined ? {} : { outputPath }),
    ...(signal === undefined ? {} : { signal }),
  });

const runCommandCapture = async (
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  label: string,
  outputPath?: string,
  signal?: AbortSignal,
): Promise<string> =>
  await new Promise<string>((resolveRun, reject) => {
    const output =
      outputPath === undefined
        ? undefined
        : createWriteStream(outputPath, { flags: "a" });
    if (signal?.aborted) {
      output?.end();
      reject(abortReason(signal, label));
      return;
    }
    const child = spawn(command, args, {
      cwd: root,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;
    let abortTimeout: NodeJS.Timeout | undefined;
    const finish = (
      code: number | null,
      closeSignal: NodeJS.Signals | null,
    ): void => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) clearTimeout(timeout);
      if (abortTimeout !== undefined) clearTimeout(abortTimeout);
      signal?.removeEventListener("abort", abort);
      output?.end();
      if (signal?.aborted) reject(abortReason(signal, label));
      else if (code === 0) resolveRun(stdout);
      else
        reject(
          new Error(
            `${label} exited with ${closeSignal ?? String(code)}${
              outputPath === undefined ? "" : `; see ${outputPath}`
            }`,
          ),
        );
    };
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    if (output !== undefined) {
      child.stdout?.pipe(output, { end: false });
      child.stderr?.pipe(output, { end: false });
    }
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) clearTimeout(timeout);
      if (abortTimeout !== undefined) clearTimeout(abortTimeout);
      signal?.removeEventListener("abort", abort);
      output?.end();
      reject(signal?.aborted ? abortReason(signal, label) : error);
    });
    child.once("exit", finish);
    timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(null, "SIGTERM");
    }, startupTimeoutMs);
    const abort = (): void => {
      child.kill("SIGTERM");
      abortTimeout = setTimeout(
        () => finish(null, "SIGTERM"),
        cleanupTimeoutMs,
      );
    };
    signal?.addEventListener("abort", abort, { once: true });
  });

const clearRedisNamespace = async (
  url: string,
  namespace: string,
): Promise<void> => {
  const redis = createClient({ url });
  await redis.connect();
  try {
    const keys: string[] = [];
    for await (const batch of redis.scanIterator({
      MATCH: `${namespace}:*`,
    })) {
      keys.push(...batch);
      while (keys.length >= 100) {
        await Promise.all(
          keys.splice(0, 100).map(async (key) => await redis.del(key)),
        );
      }
    }
    if (keys.length > 0) {
      await Promise.all(keys.map(async (key) => await redis.del(key)));
    }
  } finally {
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

const dropCellDatabase = async (
  adminUrl: string,
  databaseName: string,
): Promise<void> => {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [databaseName],
    );
    await client.query(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`,
    );
  } finally {
    await client.end();
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

const waitForExit = async (
  child: ChildProcess,
  timeoutMs: number,
): Promise<boolean> =>
  await new Promise((resolveExit) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolveExit(true);
      return;
    }
    const timeout = setTimeout(() => resolveExit(false), timeoutMs);
    child.once("close", () => {
      clearTimeout(timeout);
      resolveExit(true);
    });
  });

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

const createLoopbackProxy = async (
  runtime: CellRuntime,
): Promise<() => Promise<void>> => {
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
  return async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolveClose, reject) => {
      server.close((error) => {
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
    started.drainLogs = attachServerDiagnostics(
      child,
      log,
      started.diagnostics,
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

  public async stop(started: StartedProcess): Promise<void> {
    if (started.child.pid !== undefined) {
      for (const pid of await descendantsOf(started.child.pid)) {
        started.ownedPids.add(pid);
        const identity = await readProcessIdentity(pid);
        if (identity !== undefined)
          started.processIdentities.set(pid, identity);
      }
    }
    const pids = [...started.ownedPids].reverse();
    for (const pid of pids) {
      if (await sameProcess(pid, started.processIdentities.get(pid))) {
        process.kill(pid, "SIGTERM");
      }
    }
    await waitForExit(started.child, cleanupTimeoutMs);
    await started.drainLogs?.();
    const survivors = (
      await Promise.all(
        pids.map(async (pid) =>
          (await sameProcess(pid, started.processIdentities.get(pid)))
            ? pid
            : undefined,
        ),
      )
    ).filter((pid): pid is number => pid !== undefined);
    for (const pid of survivors) {
      process.kill(pid, "SIGKILL");
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    if (
      (
        await Promise.all(
          pids.map(
            async (pid) =>
              await sameProcess(pid, started.processIdentities.get(pid)),
          ),
        )
      ).some(Boolean)
    ) {
      throw new Error(`Could not stop ${started.label}`);
    }
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
  private readonly plans = new Map<string, string>();
  private readonly containers = new Map<string, () => void>();
  private readonly preparerAttestations: OneShotPreparerAttestation[] = [];
  private preparerReleaseIdentity: string | undefined;
  private readonly registerDisposer: (disposer: Disposer) => () => void;
  private readonly signal: AbortSignal;
  private readonly target: "runtime" | "standalone";

  public constructor(
    target: "runtime" | "standalone",
    imageId: string,
    preparerImageId: string,
    browser: ExecutionBrowser,
    registerDisposer: (disposer: Disposer) => () => void,
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
      undefined,
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
    started.drainLogs = attachServerDiagnostics(
      child,
      log,
      started.diagnostics,
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

  public async stop(started: StartedProcess): Promise<void> {
    const containerName = started.containerName;
    if (containerName === undefined) {
      throw new Error(
        `Could not determine container identity for ${started.label}`,
      );
    }
    await this.removeContainer(
      containerName,
      started.environment ?? process.env,
    );
    if (!(await waitForExit(started.child, cleanupTimeoutMs)))
      throw new Error(`Timed out stopping ${started.label}`);
    await started.drainLogs?.();
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
      async () =>
        await this.removeContainer(containerName, runtime.environment),
    );
    this.containers.set(containerName, unregister);
  }

  private async removeContainer(
    containerName: string,
    environment: NodeJS.ProcessEnv,
  ): Promise<void> {
    await runCommand(
      "docker",
      ["rm", "-f", "-v", containerName],
      environment,
      `remove ${containerName}`,
      undefined,
      AbortSignal.timeout(cleanupTimeoutMs),
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
        join(runtime.artifactDirectory, `${containerName}.inspect.json`),
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
    const attestation = {
      command,
      containerName,
      imageId: this.preparerImageId,
      inspectedImage: inspection.Image,
      releaseIdentity,
    } satisfies OneShotPreparerAttestation;
    this.preparerAttestations.push(attestation);
    await writeFile(
      join(runtime.artifactDirectory, `${containerName}.attestation.json`),
      JSON.stringify(attestation, null, 2),
    );
  }
}

class StandaloneTargetAdapter extends ReleaseTargetAdapter {
  public constructor(
    imageId: string,
    browser: ExecutionBrowser,
    registerDisposer: (disposer: Disposer) => () => void,
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
    registerDisposer: (disposer: Disposer) => () => void,
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
  const projectId = refs.getStringId("project");
  const elementIds = [refs.getNumericId("el:001"), refs.getNumericId("el:002")];
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
      projectId,
      riskScore: item.riskScore,
      status: "COMPLETED",
      summary: item.message,
      translationId: item.id,
    });
    await executeCommand({ db }, materializeQaReviewQueueItem, {
      branchId: null,
      elementId,
      languageId: "zh-Hans",
      projectId,
      translationId: item.id,
    });
  }
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
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = runtime.databaseUrl;
  const database = new DrizzleDB();
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
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
};

const adapterFor = (
  input: ExecutionCellInput,
  registerDisposer: (disposer: Disposer) => () => void,
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
  private readonly signal: AbortSignal;

  public constructor(
    input: ExecutionCellInput,
    dependencies: ExecutionCellDependencies = {},
    signal: AbortSignal = new AbortController().signal,
  ) {
    this.input = input;
    this.dependencies = dependencies;
    this.signal = signal;
  }

  public async run(): Promise<void> {
    let primaryFailure: unknown;
    try {
      this.throwIfAborted();
      const runtime =
        (await this.dependencies.createRuntime?.(this.register.bind(this))) ??
        (await this.createRuntime());
      this.throwIfAborted();
      const target =
        this.dependencies.createTarget?.(this.input) ??
        adapterFor(this.input, this.register.bind(this), this.signal);
      await target.prepare(runtime);
      this.throwIfAborted();
      await target.bootstrap(runtime);
      this.throwIfAborted();
      await target.applyExternalServicePlan(runtime);
      this.throwIfAborted();
      await (this.dependencies.hydrateFixtures ?? hydrateFixtures)(runtime);
      this.throwIfAborted();
      const validation = await target.start(runtime, "validation");
      const unregisterValidation = this.register(() => target.stop(validation));
      if (this.input.target !== "dev") {
        this.register(await createLoopbackProxy(runtime));
      }
      await target.attest(runtime, validation);
      this.throwIfAborted();
      let playwrightFailure: unknown;
      try {
        await this.runPlaywright(runtime.environment);
      } catch (error) {
        playwrightFailure = error;
      }

      let stopFailure: unknown;
      try {
        await target.stop(validation);
        unregisterValidation();
      } catch (error) {
        stopFailure = error;
      }
      const serverFailure =
        validation.diagnostics.length === 0
          ? undefined
          : new AggregateError(
              validation.diagnostics,
              "Server emitted structured error diagnostics during browser validation",
            );
      const validationFailures = [playwrightFailure, stopFailure, serverFailure]
        .filter(
          (failure): failure is NonNullable<typeof failure> =>
            failure !== undefined,
        )
        .map(toError);
      if (validationFailures.length === 1) throw validationFailures[0];
      if (validationFailures.length > 1) {
        throw new AggregateError(
          validationFailures,
          "Playwright validation, application shutdown, or server diagnostics failed",
        );
      }
    } catch (error) {
      primaryFailure = error;
    }
    const cleanupFailures = await this.cleanup();
    if (primaryFailure === undefined && cleanupFailures.length === 0) {
      await this.removeArtifacts();
    }
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
    this.register(async () => await removeDevProbeWorkspace(probeWorkspace));
    const storageDirectory = join(artifactDirectory, "storage");
    await mkdir(storageDirectory, { recursive: true });
    await chmod(storageDirectory, 0o777);
    const outputDirectory = join(artifactDirectory, "playwright");
    await mkdir(outputDirectory, { recursive: true });
    const database = await createCellDatabase(
      this.input.lease.coordinates.databaseUrl,
    );
    this.register(
      async () =>
        await dropCellDatabase(
          this.input.lease.coordinates.databaseUrl,
          database.databaseName,
        ),
    );
    const redisNamespace = `cat-e2e:${this.input.target}:${this.input.browser}:${cellId}`;
    this.register(
      async () =>
        await clearRedisNamespace(
          this.input.lease.coordinates.redisUrl,
          redisNamespace,
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
        undefined,
        this.signal,
      );
      this.register(
        async () =>
          await runCommand(
            "docker",
            ["volume", "rm", storageVolumeName],
            process.env,
            `remove ${storageVolumeName}`,
            undefined,
            AbortSignal.timeout(cleanupTimeoutMs),
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
      environment,
      `${this.input.target}-${this.input.browser} Playwright`,
      undefined,
      this.signal,
    );
  }

  private register(disposer: Disposer): () => void {
    const registered: RegisteredDisposer = { active: true, dispose: disposer };
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
    await rm(this.artifactDirectory, { force: true, recursive: true });
  }

  private async cleanup(): Promise<Error[]> {
    const failures: Error[] = [];
    for (const disposer of this.disposers.reverse()) {
      if (!disposer.active) continue;
      let timeout: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          disposer.dispose(),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error("Execution cell cleanup timed out")),
              cleanupTimeoutMs,
            );
          }),
        ]);
      } catch (error) {
        failures.push(toError(error));
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
    }
    return failures;
  }
}

export type ScheduleOptions = {
  concurrency?: 1 | 2;
  createCell?: (input: ExecutionCellInput) => {
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
  const createCell =
    options.createCell ?? ((input) => new ExecutionCell(input, {}, signal));
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
  signal.addEventListener("abort", stopScheduling, { once: true });

  const runCell = async (input: ExecutionCellInput): Promise<void> => {
    try {
      await createCell(input).run(signal);
    } catch (firstFailure) {
      if (signal.aborted) throw firstFailure;
      if (!options.retryFailedCells) throw firstFailure;
      try {
        // Creating a new ExecutionCell gives the retry fresh database, storage,
        // port, process, and artifact ownership rather than reusing failed state.
        await createCell(input).run(signal);
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
