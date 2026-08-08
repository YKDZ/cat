import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { formatDiagnosticErrorTree, redactDiagnosticText } from "@cat/shared";

import {
  runWithTestServiceLease,
  serializeTestServiceLease,
  type SpacyReadyProbe,
} from "../apps/app-e2e/test-service-lease.ts";
import {
  exportValidatedImages,
  runApplicationLifecycle,
  type ApplicationLifecycleReport,
} from "./check-all-containers.ts";
import {
  buildReleaseImages,
  type ReleaseImageBuildResult,
} from "./image-builder.ts";

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

export type CommandExecutionResult = { stderr: string; stdout: string };

export type CommandRunner = (
  command: string,
  args: string[],
  options: CommandRunnerOptions,
) => Promise<CommandExecutionResult>;

export class CommandExecutionError extends Error {
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly stderr: string;
  readonly stdout: string;

  constructor(
    message: string,
    exitCode: number | null,
    signal: string | null,
    stderr = "",
    stdout = "",
  ) {
    const safeMessage = redactDiagnosticText(message);
    const safeStderr = redactDiagnosticText(stderr);
    const safeStdout = redactDiagnosticText(stdout);
    super(
      [
        safeMessage,
        ...(safeStdout === "" ? [] : [`stdout:\n${safeStdout.trimEnd()}`]),
        ...(safeStderr === "" ? [] : [`stderr:\n${safeStderr.trimEnd()}`]),
      ].join("\n"),
    );
    this.name = "CommandExecutionError";
    this.exitCode = exitCode;
    this.signal = signal;
    this.stderr = safeStderr;
    this.stdout = safeStdout;
  }
}

export class CommandStartError extends Error {
  readonly code: string | undefined;
  readonly path: string | undefined;

  constructor(command: string, error: unknown) {
    const code =
      typeof Reflect.get(Object(error), "code") === "string"
        ? redactDiagnosticText(String(Reflect.get(Object(error), "code")))
        : undefined;
    const path =
      typeof Reflect.get(Object(error), "path") === "string"
        ? redactDiagnosticText(String(Reflect.get(Object(error), "path")))
        : undefined;
    const safeCommand = redactDiagnosticText(command);
    super(
      `${safeCommand} command could not start${code === undefined ? "" : ` code=${code}`}${path === undefined ? "" : ` path=${path}`}`,
    );
    this.name = "CommandStartError";
    this.code = code;
    this.path = path;
  }
}

const safeCommandStartError = (
  command: string,
  error: unknown,
  signal: AbortSignal | undefined,
): Error => {
  const errorName =
    typeof Reflect.get(Object(error), "name") === "string"
      ? String(Reflect.get(Object(error), "name"))
      : undefined;
  const errorCode = Reflect.get(Object(error), "code");
  if (
    signal?.aborted === true ||
    errorName === "AbortError" ||
    errorCode === "ABORT_ERR"
  ) {
    const abortError = new Error(
      `${redactDiagnosticText(command)} command aborted`,
    );
    abortError.name = "AbortError";
    Object.defineProperty(abortError, "code", {
      configurable: true,
      enumerable: true,
      value: "ABORT_ERR",
    });
    return abortError;
  }
  return new CommandStartError(command, error);
};

export interface ApplicationLifecycleContext {
  buildId?: string;
  env: NodeJS.ProcessEnv;
  projectName: string;
  report?: (message: string) => void;
  reportError?: (message: string) => void;
  run: CommandRunner;
  signal: AbortSignal;
}

const formatStageDuration = (durationMs: number): string => `${durationMs}ms`;

export type ImageBuilder = (
  context: ApplicationLifecycleContext,
) => Promise<ReleaseImageBuildResult>;

export interface RunCheckAllOptions {
  applicationLifecycle?: (
    context: ApplicationLifecycleContext,
    images: ReleaseImageBuildResult,
  ) => Promise<ApplicationLifecycleReport | void>;
  appPort?: number;
  dockerGateway?: string;
  dockerHost?: string;
  e2eConcurrency?: 1 | 2;
  env?: NodeJS.ProcessEnv;
  buildId?: string;
  log?: (message: string) => void;
  reportError?: (message: string) => void;
  imageBuilder?: ImageBuilder;
  projectName?: string;
  run?: CommandRunner;
  signals?: SignalSource;
  spacyReadyProbe?: SpacyReadyProbe;
}

const workspaceRoot = resolve(import.meta.dirname, "..");
const checkAllStages = [
  ["database", ["--filter", "@cat/db", "drizzle:push"]],
  ["integration", ["test:integration"]],
  ["compose-contract", ["test:compose-contract"]],
  ["pglite", ["test:pglite"]],
  ["dockerfile", ["container:check-dockerfile"]],
  ["build", ["build:all"]],
  ["image-artifact-contract", ["test:image-artifact-contract"]],
  ["artifacts", ["test:artifacts:verify"]],
] as const;

const defaultImageBuilder: ImageBuilder = async (context) =>
  await buildReleaseImages({
    buildId: context.buildId ?? context.projectName,
    env: context.env,
    ...(context.report === undefined ? {} : { report: context.report }),
    ...(context.reportError === undefined
      ? {}
      : { reportError: context.reportError }),
    run: context.run,
    signal: context.signal,
    targets: ["standalone", "runtime"],
  });

const targetImageIds = (
  images: ReleaseImageBuildResult,
): Record<"runtime" | "spacy" | "standalone", string> => {
  const standalone = images.images.find(
    (image) => image.target === "standalone",
  )?.imageId;
  const runtime = images.images.find(
    (image) => image.target === "runtime",
  )?.imageId;
  const spacy = images.images.find(
    (image) => image.target === "spacy",
  )?.imageId;
  if (
    standalone === undefined ||
    runtime === undefined ||
    spacy === undefined
  ) {
    throw new Error(
      "Image build did not return every immutable release target",
    );
  }
  return { runtime, spacy, standalone };
};

type E2EAttestationEvidence = {
  cells: Array<{
    browser: "chromium" | "firefox";
    imageId?: string;
    preparerImageId?: string;
    target: "dev" | "runtime" | "standalone";
  }>;
};

const readE2eAttestation = async (
  path: string,
  expectedImageIds: Record<"runtime" | "standalone", string>,
  releaseIdentity: string,
): Promise<E2EAttestationEvidence> => {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(
      `E2E did not produce a readable release attestation: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("E2E release attestation is not an object");
  }
  const releaseImages = Reflect.get(value, "releaseImages");
  const cells = Reflect.get(value, "cells");
  if (
    typeof releaseImages !== "object" ||
    releaseImages === null ||
    Array.isArray(releaseImages) ||
    Reflect.get(releaseImages, "releaseIdentity") !== releaseIdentity ||
    Reflect.get(releaseImages, "standaloneImageId") !==
      expectedImageIds.standalone ||
    Reflect.get(releaseImages, "runtimeImageId") !== expectedImageIds.runtime ||
    !Array.isArray(cells)
  ) {
    throw new Error("E2E release attestation does not match the built images");
  }
  const normalizedCells = cells.map((cell) => {
    if (typeof cell !== "object" || cell === null || Array.isArray(cell)) {
      throw new Error("E2E release attestation has an invalid execution cell");
    }
    const browser = Reflect.get(cell, "browser");
    const imageId = Reflect.get(cell, "imageId");
    const preparerImageId = Reflect.get(cell, "preparerImageId");
    const target = Reflect.get(cell, "target");
    if (
      (browser !== "chromium" && browser !== "firefox") ||
      (target !== "dev" && target !== "standalone" && target !== "runtime") ||
      (imageId !== undefined && typeof imageId !== "string") ||
      (preparerImageId !== undefined && typeof preparerImageId !== "string")
    ) {
      throw new Error("E2E release attestation has an invalid execution cell");
    }
    return {
      browser,
      ...(typeof imageId === "string" ? { imageId } : {}),
      ...(typeof preparerImageId === "string" ? { preparerImageId } : {}),
      target,
    };
  });
  const expectedCells = [
    { browser: "chromium", target: "dev" },
    {
      browser: "chromium",
      imageId: expectedImageIds.standalone,
      target: "standalone",
    },
    {
      browser: "firefox",
      imageId: expectedImageIds.standalone,
      target: "standalone",
    },
    {
      browser: "chromium",
      imageId: expectedImageIds.runtime,
      preparerImageId: expectedImageIds.standalone,
      target: "runtime",
    },
    {
      browser: "firefox",
      imageId: expectedImageIds.runtime,
      preparerImageId: expectedImageIds.standalone,
      target: "runtime",
    },
  ];
  if (
    expectedCells.some(
      (expected) =>
        !normalizedCells.some(
          (actual) => JSON.stringify(actual) === JSON.stringify(expected),
        ),
    )
  ) {
    throw new Error(
      "E2E release attestation does not cover the complete immutable image matrix",
    );
  }
  return { cells: normalizedCells };
};

const resolveE2eConcurrency = (
  options: RunCheckAllOptions,
  environment: NodeJS.ProcessEnv,
): 1 | 2 => {
  if (options.e2eConcurrency !== undefined) return options.e2eConcurrency;
  const configured = environment.CAT_CHECK_ALL_E2E_CONCURRENCY;
  if (configured === undefined || configured === "") return 2;
  if (configured === "1") return 1;
  if (configured === "2") return 2;
  throw new Error("CAT_CHECK_ALL_E2E_CONCURRENCY must be 1 or 2");
};

const directExecution = (): boolean => {
  const entryPath = process.argv[1];
  return (
    entryPath !== undefined &&
    fileURLToPath(import.meta.url) === resolve(entryPath)
  );
};

const commandTerminationGraceMs = 60_000;
const commandTerminationSettlementMs = 5_000;

const commandProcessGroupIsAlive = (child: ChildProcess): boolean => {
  if (child.pid === undefined || process.platform === "win32") return false;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
};

export const signalCommandProcessTree = (
  child: ChildProcess,
  signal: NodeJS.Signals,
): Error | undefined => {
  if (child.pid !== undefined && process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
      return undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return undefined;
      return new Error(
        `Could not signal command process group with ${signal}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
  try {
    if (child.kill(signal)) return undefined;
    return new Error(`Could not signal command process with ${signal}`);
  } catch (error) {
    return new Error(
      `Could not signal command process with ${signal}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
};

export const runCheckAllCommand: CommandRunner = async (
  command,
  args,
  options,
): Promise<{ stderr: string; stdout: string }> =>
  await new Promise((resolvePromise, reject) => {
    const pipeOutput = options.stdio === "pipe";
    const child = spawn(command, args, {
      cwd: options.cwd,
      detached: process.platform !== "win32",
      env: options.env,
      stdio: pipeOutput
        ? ["ignore", "pipe", "pipe"]
        : ["inherit", "inherit", "inherit"],
    });
    let stdout = "";
    let stderr = "";
    let closed:
      | { code: number | null; signal: NodeJS.Signals | null }
      | undefined;
    let forcedSettlement: NodeJS.Timeout | undefined;
    let forceTermination: NodeJS.Timeout | undefined;
    let requestedFailure: Error | undefined;
    let settlementPoll: NodeJS.Timeout | undefined;
    let settlementExpired = false;
    let settled = false;
    const cleanup = (): void => {
      options.signal?.removeEventListener("abort", abort);
      if (forcedSettlement !== undefined) clearTimeout(forcedSettlement);
      if (forceTermination !== undefined) clearTimeout(forceTermination);
      if (settlementPoll !== undefined) clearTimeout(settlementPoll);
    };
    const finish = (): void => {
      if (settled || closed === undefined) return;
      if (
        requestedFailure !== undefined &&
        !settlementExpired &&
        commandProcessGroupIsAlive(child)
      ) {
        settlementPoll = setTimeout(finish, 10);
        return;
      }
      settled = true;
      cleanup();
      if (requestedFailure !== undefined) {
        reject(requestedFailure);
        return;
      }
      const { code, signal } = closed;
      if (code === 0) {
        resolvePromise({ stderr, stdout });
        return;
      }
      reject(
        new CommandExecutionError(
          `${command} command failed${
            signal === null
              ? ` with exit code ${String(code)}`
              : ` from ${signal}`
          }`,
          code,
          signal,
          stderr,
          stdout,
        ),
      );
    };
    const abort = (): void => {
      if (requestedFailure !== undefined) return;
      requestedFailure = safeCommandStartError(
        command,
        options.signal?.reason,
        options.signal,
      );
      const terminationFailure = signalCommandProcessTree(child, "SIGTERM");
      if (terminationFailure !== undefined) {
        requestedFailure = new AggregateError(
          [requestedFailure, terminationFailure],
          `${command} command could not be interrupted`,
        );
      }
      forceTermination = setTimeout(() => {
        if (!commandProcessGroupIsAlive(child)) {
          finish();
          return;
        }
        const forceFailure = signalCommandProcessTree(child, "SIGKILL");
        if (forceFailure !== undefined) {
          requestedFailure = new AggregateError(
            [requestedFailure!, forceFailure],
            `${command} command could not be force-stopped`,
          );
        }
        forcedSettlement = setTimeout(() => {
          settlementExpired = true;
          if (commandProcessGroupIsAlive(child)) {
            requestedFailure = new AggregateError(
              [
                requestedFailure!,
                new Error(`${command} command process group remained alive`),
              ],
              `${command} command did not settle after interruption`,
            );
          }
          closed ??= { code: null, signal: "SIGKILL" };
          finish();
        }, commandTerminationSettlementMs);
      }, commandTerminationGraceMs);
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      if (requestedFailure !== undefined) return;
      settled = true;
      cleanup();
      reject(safeCommandStartError(command, error, options.signal));
    });
    child.once("close", (code, signal) => {
      closed = { code, signal };
      finish();
    });
  });

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

export class CheckAllInterruptedError extends Error {
  readonly signal: CheckAllSignal;

  constructor(signal: CheckAllSignal, cause?: unknown) {
    super(`check:all interrupted by ${signal}`, {
      ...(cause === undefined ? {} : { cause }),
    });
    this.name = "CheckAllInterruptedError";
    this.signal = signal;
  }
}

export type CheckAllCommand = {
  buildId?: string;
  e2eConcurrency?: 1 | 2;
};

export const parseCheckAllCommand = (args: string[]): CheckAllCommand => {
  const commandArgs = args[0] === "--" ? args.slice(1) : args;
  const command: CheckAllCommand = {};
  for (let index = 0; index < commandArgs.length; index += 2) {
    const flag = commandArgs[index];
    const value = commandArgs[index + 1];
    if (value === undefined) {
      throw new Error(
        "Usage: check-all.ts [--build-id <identity>] [--e2e-concurrency <1|2>]",
      );
    }
    if (flag === "--build-id" && command.buildId === undefined) {
      if (value.trim() === "") throw new Error("--build-id must not be empty");
      command.buildId = value;
      continue;
    }
    if (flag === "--e2e-concurrency" && command.e2eConcurrency === undefined) {
      if (value === "1" || value === "2") {
        command.e2eConcurrency = value === "1" ? 1 : 2;
        continue;
      }
    }
    throw new Error(
      "Usage: check-all.ts [--build-id <identity>] [--e2e-concurrency <1|2>]",
    );
  }
  return command;
};

export const runCheckAll = async (
  options: RunCheckAllOptions = {},
): Promise<void> => {
  const run = options.run ?? runCheckAllCommand;
  const signals = options.signals ?? process;
  const log =
    options.log ?? ((message) => process.stdout.write(`${message}\n`));
  const writeError =
    options.reportError ?? ((message: string) => process.stderr.write(message));
  const reportError = (message: string): void => {
    writeError(redactDiagnosticText(message));
  };
  const baseEnv = { ...process.env, ...options.env };
  const dockerHost =
    options.dockerHost ??
    baseEnv.CAT_CHECK_ALL_DOCKER_HOST ??
    options.dockerGateway;
  const projectName =
    options.projectName ??
    baseEnv.CAT_CHECK_ALL_PROJECT_NAME ??
    `cat-check-all-${process.pid}-${randomUUID().slice(0, 8)}`;
  const buildId =
    options.buildId ?? baseEnv.CAT_CHECK_ALL_BUILD_ID ?? projectName;
  if (buildId.trim() === "") {
    throw new Error("check:all build ID must be a non-empty string");
  }
  const e2eConcurrency = resolveE2eConcurrency(options, baseEnv);
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

  const throwIfInterrupted = (cause?: unknown): void => {
    if (interruptedBy !== undefined) {
      throw new CheckAllInterruptedError(interruptedBy, cause);
    }
  };
  const runOperationStage = async <Result>(
    name: string,
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    throwIfInterrupted();
    const startedAt = performance.now();
    log(`check:all stage=${name} status=started`);
    try {
      const result = await operation();
      throwIfInterrupted();
      const durationMs = Math.round(performance.now() - startedAt);
      log(
        `check:all stage=${name} status=passed duration=${formatStageDuration(durationMs)}`,
      );
      return result;
    } catch (error) {
      const durationMs = Math.round(performance.now() - startedAt);
      log(
        `check:all stage=${name} status=failed duration=${formatStageDuration(durationMs)}`,
      );
      // Node reports an AbortError from spawn before the signal handler's
      // lifecycle cleanup has returned; normalize it after release completes.
      throwIfInterrupted(error);
      throw error;
    }
  };
  const runStage = async (
    name: string,
    args: string[],
    env: NodeJS.ProcessEnv,
  ): Promise<void> =>
    await runOperationStage(name, async () => {
      await run("pnpm", args, {
        cwd: workspaceRoot,
        env,
        signal: abortController.signal,
        stdio: "inherit",
      });
    });

  try {
    await runStage("check", ["check"], baseEnv);
    const spacyImages = await runOperationStage(
      "spacy-image-build",
      async () =>
        await buildReleaseImages({
          buildId,
          env: baseEnv,
          report: (message) => log(message.trimEnd()),
          reportError,
          run,
          signal: abortController.signal,
          targets: ["spacy"],
        }),
    );
    const spacyImageId = spacyImages.images[0]?.imageId;
    if (spacyImageId === undefined) {
      throw new Error("spaCy image build returned no immutable image");
    }
    await runWithTestServiceLease(
      {
        environment: {
          ...baseEnv,
          CAT_SPACY_IMAGE_ID: spacyImageId,
          ...(baseEnv.CAT_CHECK_ALL_POSTGRES_PASSWORD === undefined
            ? {}
            : {
                CAT_E2E_POSTGRES_PASSWORD:
                  baseEnv.CAT_CHECK_ALL_POSTGRES_PASSWORD,
              }),
          ...(baseEnv.CAT_CHECK_ALL_POSTGRES_USER === undefined
            ? {}
            : { CAT_E2E_POSTGRES_USER: baseEnv.CAT_CHECK_ALL_POSTGRES_USER }),
          ...(baseEnv.CAT_CHECK_ALL_REDIS_PASSWORD === undefined
            ? {}
            : { CAT_E2E_REDIS_PASSWORD: baseEnv.CAT_CHECK_ALL_REDIS_PASSWORD }),
        },
        run: async (command, args, commandOptions) =>
          await run(command, args, commandOptions),
        signal: abortController.signal,
        ...(options.spacyReadyProbe === undefined
          ? {}
          : { spacyReadyProbe: options.spacyReadyProbe }),
        ...(dockerHost === undefined ? {} : { dockerHost }),
      },
      async (lease) => {
        const appPort = options.appPort ?? (await availablePort());
        const integrationEnv = {
          ...baseEnv,
          CAT_CHECK_ALL_BUILD_ID: buildId,
          CAT_SPACY_IMAGE_ID: spacyImageId,
          CAT_TEST_SERVICE_LEASE: serializeTestServiceLease(lease),
          DATABASE_URL: lease.coordinates.databaseUrl,
          PORT: String(appPort),
          PW_REUSE_EXISTING_SERVER: "false",
          REDIS_URL: lease.coordinates.redisUrl,
          SPACY_SERVER_URL: lease.coordinates.spacyUrl,
          TEST_DATABASE_URL: lease.coordinates.databaseUrl,
        };
        const lifecycleContext = {
          buildId,
          env: integrationEnv,
          projectName,
          report: (message: string): void => log(message.trimEnd()),
          reportError,
          run,
          signal: abortController.signal,
        };
        const applicationLifecycle =
          options.applicationLifecycle ?? runApplicationLifecycle;
        let imageConstructionCompleted = false;
        for (const [name, args] of checkAllStages) {
          await runStage(name, [...args], integrationEnv);
          if (name === "build") {
            const images = await runOperationStage("image-build", async () => {
              const result = await (
                options.imageBuilder ?? defaultImageBuilder
              )(lifecycleContext);
              const images = {
                images: [...result.images, ...spacyImages.images],
              };
              targetImageIds(images);
              return images;
            });
            const imageIds = targetImageIds(images);
            log(
              `check:all images build-id=${buildId} standalone=${imageIds.standalone} runtime=${imageIds.runtime} spacy=${imageIds.spacy}`,
            );
            const attestationDirectory = await mkdtemp(
              join(tmpdir(), "cat-check-all-e2e-attestation-"),
            );
            const attestationPath = join(
              attestationDirectory,
              "release-e2e.json",
            );
            try {
              await runOperationStage("e2e", async () => {
                await run(
                  "pnpm",
                  ["test:e2e", "--", "--concurrency", String(e2eConcurrency)],
                  {
                    cwd: workspaceRoot,
                    env: {
                      ...integrationEnv,
                      CAT_E2E_ATTESTATION_PATH: attestationPath,
                      CAT_E2E_RUNTIME_IMAGE_ID: imageIds.runtime,
                      CAT_E2E_STANDALONE_IMAGE_ID: imageIds.standalone,
                    },
                    signal: abortController.signal,
                    stdio: "inherit",
                  },
                );
                await readE2eAttestation(attestationPath, imageIds, buildId);
              });
            } finally {
              await rm(attestationDirectory, { force: true, recursive: true });
            }
            log(
              `check:all e2e release-matrix=attested standalone=${imageIds.standalone} runtime=${imageIds.runtime}`,
            );
            const lifecycleReport = await runOperationStage(
              "container-lifecycle",
              async () => await applicationLifecycle(lifecycleContext, images),
            );
            const lifecycleImageIds =
              lifecycleReport?.validatedImageIds ?? imageIds;
            log(
              `check:all lifecycle standalone=${lifecycleImageIds.standalone} runtime=${lifecycleImageIds.runtime} spacy=${lifecycleImageIds.spacy}`,
            );
            const exportResult = await runOperationStage(
              "image-artifact",
              async () => await exportValidatedImages(lifecycleContext, images),
            );
            if (exportResult !== undefined) {
              log(
                `check:all image-artifact manifest=${exportResult.manifestPath} digest=${exportResult.manifestDigest}`,
              );
            }
            imageConstructionCompleted = true;
          }
          throwIfInterrupted();
        }
        if (!imageConstructionCompleted) {
          throw new Error("check:all did not complete image construction");
        }
      },
    );
    throwIfInterrupted();
  } catch (error) {
    throwIfInterrupted(error);
    throw error;
  } finally {
    for (const [signal, listener] of signalListeners) {
      signals.off(signal, listener);
    }
  }
};

export interface RunCheckAllCliOptions {
  args?: string[];
  execute?: (options: RunCheckAllOptions) => Promise<void>;
  writeError?: (message: string) => void;
}

export const runCheckAllCli = async (
  options: RunCheckAllCliOptions = {},
): Promise<number> => {
  try {
    await (options.execute ?? runCheckAll)({
      applicationLifecycle: runApplicationLifecycle,
      ...parseCheckAllCommand(options.args ?? process.argv.slice(2)),
    });
    return 0;
  } catch (error) {
    (options.writeError ?? ((message) => process.stderr.write(message)))(
      `${formatDiagnosticErrorTree(error)}\n`,
    );
    return error instanceof CheckAllInterruptedError
      ? error.signal === "SIGINT"
        ? 130
        : 143
      : 1;
  }
};

if (directExecution()) process.exitCode = await runCheckAllCli();
