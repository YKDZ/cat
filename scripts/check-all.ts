import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runApplicationLifecycle } from "./check-all-containers.ts";

export type CheckAllSignal = "SIGINT" | "SIGTERM";

export interface SignalSource {
  on(signal: CheckAllSignal, listener: () => void): unknown;
  off(signal: CheckAllSignal, listener: () => void): unknown;
}

export interface CommandRunnerOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  stdio?: "inherit" | "pipe";
}

export type CommandRunner = (
  command: string,
  args: string[],
  options: CommandRunnerOptions,
) => Promise<{ stdout: string }>;

export class CommandExecutionError extends Error {
  readonly exitCode: number | null;
  readonly signal: string | null;

  constructor(message: string, exitCode: number | null, signal: string | null) {
    super(message);
    this.name = "CommandExecutionError";
    this.exitCode = exitCode;
    this.signal = signal;
  }
}

export interface CheckAllStageResult {
  name: string;
  durationMs: number;
}

export interface CheckAllReport {
  projectName: string;
  databaseUrl: string;
  redisUrl: string;
  stages: CheckAllStageResult[];
}

export interface ApplicationLifecycleContext {
  env: NodeJS.ProcessEnv;
  projectName: string;
  run: CommandRunner;
  signal: AbortSignal;
}

export interface RunCheckAllOptions {
  applicationLifecycle?: (
    context: ApplicationLifecycleContext,
  ) => Promise<void>;
  appPort?: number;
  dockerGateway?: string;
  dockerHost?: string;
  env?: NodeJS.ProcessEnv;
  log?: (message: string) => void;
  projectName?: string;
  run?: CommandRunner;
  signals?: SignalSource;
}

const workspaceRoot = resolve(import.meta.dirname, "..");
const composeFile = resolve(import.meta.dirname, "check-all.compose.yml");
const postgresImage = "cat-check-all-postgresql:local";
const redisImage = "redis:8-alpine";
const composeShutdownSeconds = 15;
const composeCleanupTimeoutMs = 60_000;
const checkAllStages = [
  ["database", ["--filter", "@cat/db", "drizzle:push"]],
  ["integration", ["test:integration"]],
  ["pglite", ["test:pglite"]],
  ["e2e", ["test:e2e"]],
  ["build", ["build:all"]],
  ["artifacts", ["test:artifacts:verify"]],
] as const;

const directExecution = (): boolean => {
  const entryPath = process.argv[1];
  return (
    entryPath !== undefined &&
    fileURLToPath(import.meta.url) === resolve(entryPath)
  );
};

const defaultRunner: CommandRunner = async (
  command,
  args,
  options,
): Promise<{ stdout: string }> =>
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      signal: options.signal,
      stdio:
        options.stdio === "pipe"
          ? ["ignore", "pipe", "inherit"]
          : ["inherit", "inherit", "inherit"],
    });
    let stdout = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolvePromise({ stdout });
        return;
      }
      reject(
        new CommandExecutionError(
          `${command} ${args.join(" ")} failed${
            signal === null
              ? ` with exit code ${String(code)}`
              : ` from ${signal}`
          }`,
          code,
          signal,
        ),
      );
    });
  });

const composeArgs = (projectName: string): string[] => [
  "compose",
  "--project-name",
  projectName,
  "--file",
  composeFile,
];

const parsePublishedPort = (value: string, service: string): number => {
  const match = value.trim().match(/:(\d+)$/);
  const port = match?.[1] === undefined ? Number.NaN : Number(match[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `Could not discover ${service} published port from ${JSON.stringify(value)}`,
    );
  }
  return port;
};

const defaultGateway = (): string | undefined => {
  if (!existsSync("/.dockerenv")) return undefined;
  const route = readFileSync("/proc/net/route", "utf8")
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .find((columns) => columns[1] === "00000000");
  const gateway = route?.[2];
  if (gateway === undefined || !/^[0-9A-Fa-f]{8}$/.test(gateway))
    return undefined;
  return gateway
    .match(/../g)
    ?.reverse()
    .map((byte) => Number.parseInt(byte, 16))
    .join(".");
};

const formatUrlHost = (host: string): string =>
  host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;

const randomPostgresIdentifier = (prefix = "cat"): string =>
  `${prefix}_${randomUUID().replaceAll("-", "")}`;

const assertSafeBindHost = (host: string): string => {
  const wildcardHost = ["0", "0", "0", "0"].join(".");
  if (host === wildcardHost || host === "::") {
    throw new Error("check:all service ports must bind to a specific host");
  }
  return host;
};

const availablePort = async (): Promise<number> =>
  await new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate an application port"));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolvePromise(address.port);
      });
    });
  });

const sleep = async (durationMs: number): Promise<void> =>
  await new Promise((resolvePromise) => setTimeout(resolvePromise, durationMs));

class CheckAllInterruptedError extends Error {
  readonly signal: CheckAllSignal;

  constructor(signal: CheckAllSignal) {
    super(`check:all interrupted by ${signal}`);
    this.name = "CheckAllInterruptedError";
    this.signal = signal;
  }
}

export const runCheckAll = async (
  options: RunCheckAllOptions = {},
): Promise<CheckAllReport> => {
  const run = options.run ?? defaultRunner;
  const signals = options.signals ?? process;
  const log =
    options.log ?? ((message) => process.stdout.write(`${message}\n`));
  const baseEnv = { ...process.env, ...options.env };
  const redisPassword =
    baseEnv.CAT_CHECK_ALL_REDIS_PASSWORD ?? randomUUID().replaceAll("-", "");
  const postgresDatabase =
    baseEnv.CAT_CHECK_ALL_POSTGRES_DB ?? randomPostgresIdentifier("cat_test");
  const postgresPassword =
    baseEnv.CAT_CHECK_ALL_POSTGRES_PASSWORD ?? randomUUID().replaceAll("-", "");
  const postgresUser =
    baseEnv.CAT_CHECK_ALL_POSTGRES_USER ?? randomPostgresIdentifier();
  const dockerGateway = options.dockerGateway ?? defaultGateway();
  const dockerHost =
    options.dockerHost ??
    baseEnv.CAT_CHECK_ALL_DOCKER_HOST ??
    dockerGateway ??
    "127.0.0.1";
  const bindHost = assertSafeBindHost(
    baseEnv.CAT_CHECK_ALL_BIND_HOST ??
      options.dockerHost ??
      dockerGateway ??
      "127.0.0.1",
  );
  const serviceEnv = {
    ...baseEnv,
    CAT_CHECK_ALL_BIND_HOST: bindHost,
    CAT_CHECK_ALL_POSTGRES_DB: postgresDatabase,
    CAT_CHECK_ALL_POSTGRES_PASSWORD: postgresPassword,
    CAT_CHECK_ALL_POSTGRES_USER: postgresUser,
    CAT_CHECK_ALL_REDIS_PASSWORD: redisPassword,
  };
  const projectName =
    options.projectName ??
    baseEnv.CAT_CHECK_ALL_PROJECT_NAME ??
    `cat-check-all-${process.pid}-${randomUUID().slice(0, 8)}`;
  const abortController = new AbortController();
  let interruptedBy: CheckAllSignal | undefined;
  const signalListeners = new Map<CheckAllSignal, () => void>();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    const listener = (): void => {
      interruptedBy ??= signal;
      abortController.abort();
    };
    signalListeners.set(signal, listener);
    signals.on(signal, listener);
  }

  const throwIfInterrupted = (): void => {
    if (interruptedBy !== undefined) {
      throw new CheckAllInterruptedError(interruptedBy);
    }
  };
  const stages: CheckAllStageResult[] = [];
  const runStage = async (
    name: string,
    args: string[],
    env: NodeJS.ProcessEnv,
  ): Promise<void> => {
    throwIfInterrupted();
    const startedAt = performance.now();
    log(`[check:all] ${name} started`);
    await run("pnpm", args, {
      cwd: workspaceRoot,
      env,
      signal: abortController.signal,
      stdio: "inherit",
    });
    throwIfInterrupted();
    const durationMs = Math.round(performance.now() - startedAt);
    stages.push({ name, durationMs });
    log(`[check:all] ${name} passed in ${durationMs}ms`);
  };

  let report: CheckAllReport | undefined;
  let failure: unknown;
  try {
    await runStage("check", ["check"], baseEnv);

    log(`[check:all] starting isolated services (${projectName})`);
    const ensureImage = async (
      image: string,
      build: () => Promise<void>,
    ): Promise<void> => {
      const exists = await run("docker", ["image", "inspect", image], {
        cwd: workspaceRoot,
        env: serviceEnv,
        signal: abortController.signal,
        stdio: "pipe",
      })
        .then(() => true)
        .catch(() => false);
      if (exists) return;

      let lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await build();
          return;
        } catch (error) {
          lastError = error;
          if (attempt < 3) {
            log(
              `[check:all] image ${image} attempt ${attempt} failed; retrying`,
            );
            await sleep(attempt * 1000);
          }
        }
      }
      throw lastError;
    };
    await ensureImage(postgresImage, async () => {
      await run(
        "docker",
        [...composeArgs(projectName), "build", "postgresql"],
        {
          cwd: workspaceRoot,
          env: serviceEnv,
          signal: abortController.signal,
          stdio: "inherit",
        },
      );
    });
    await ensureImage(redisImage, async () => {
      await run("docker", ["pull", redisImage], {
        cwd: workspaceRoot,
        env: serviceEnv,
        signal: abortController.signal,
        stdio: "inherit",
      });
    });
    await run(
      "docker",
      [
        ...composeArgs(projectName),
        "up",
        "--detach",
        "--no-build",
        "--pull",
        "never",
        "--wait",
        "--wait-timeout",
        "300",
      ],
      {
        cwd: workspaceRoot,
        env: serviceEnv,
        signal: abortController.signal,
        stdio: "inherit",
      },
    );
    throwIfInterrupted();

    const [postgresPortResult, redisPortResult] = await Promise.all([
      run(
        "docker",
        [...composeArgs(projectName), "port", "postgresql", "5432"],
        {
          cwd: workspaceRoot,
          env: serviceEnv,
          signal: abortController.signal,
          stdio: "pipe",
        },
      ),
      run("docker", [...composeArgs(projectName), "port", "redis", "6379"], {
        cwd: workspaceRoot,
        env: serviceEnv,
        signal: abortController.signal,
        stdio: "pipe",
      }),
    ]);
    const postgresPort = parsePublishedPort(
      postgresPortResult.stdout,
      "PostgreSQL",
    );
    const redisPort = parsePublishedPort(redisPortResult.stdout, "Redis");
    const urlHost = formatUrlHost(dockerHost);
    const databaseUrl = `postgresql://${encodeURIComponent(postgresUser)}:${encodeURIComponent(postgresPassword)}@${urlHost}:${postgresPort}/${encodeURIComponent(postgresDatabase)}`;
    const redisUrl = `redis://:${encodeURIComponent(redisPassword)}@${urlHost}:${redisPort}`;
    const appPort = options.appPort ?? (await availablePort());
    const integrationEnv = {
      ...baseEnv,
      DATABASE_URL: databaseUrl,
      E2E_COMPOSE_TEARDOWN: "false",
      PORT: String(appPort),
      PW_REUSE_EXISTING_SERVER: "false",
      REDIS_URL: redisUrl,
      TEST_DATABASE_URL: databaseUrl,
    };

    for (const [name, args] of checkAllStages) {
      await runStage(name, [...args], integrationEnv);
      if (name === "build" && options.applicationLifecycle !== undefined) {
        await options.applicationLifecycle({
          env: integrationEnv,
          projectName,
          run,
          signal: abortController.signal,
        });
        throwIfInterrupted();
      }
    }

    report = { projectName, databaseUrl, redisUrl, stages };
  } catch (error) {
    failure =
      interruptedBy === undefined
        ? error
        : new CheckAllInterruptedError(interruptedBy);
  }

  log(`[check:all] cleaning isolated services (${projectName})`);
  try {
    await run(
      "docker",
      [
        ...composeArgs(projectName),
        "down",
        "--volumes",
        "--remove-orphans",
        "--timeout",
        String(composeShutdownSeconds),
      ],
      {
        cwd: workspaceRoot,
        env: serviceEnv,
        signal: AbortSignal.timeout(composeCleanupTimeoutMs),
        stdio: "inherit",
      },
    );
  } catch (cleanupError) {
    if (failure === undefined) failure = cleanupError;
    else log(`[check:all] cleanup also failed: ${String(cleanupError)}`);
  } finally {
    for (const [signal, listener] of signalListeners) {
      signals.off(signal, listener);
    }
  }

  if (failure !== undefined) throw failure;
  if (report === undefined)
    throw new Error("check:all completed without a report");
  return report;
};

const main = async (): Promise<void> => {
  try {
    const report = await runCheckAll({
      applicationLifecycle: runApplicationLifecycle,
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode =
      error instanceof CheckAllInterruptedError
        ? error.signal === "SIGINT"
          ? 130
          : 143
        : 1;
  }
};

if (directExecution()) await main();
