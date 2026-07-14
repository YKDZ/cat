import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  runWithTestServiceLease,
  serializeTestServiceLease,
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
  images: {
    buildId: string;
    e2eAttestation: {
      cells: Array<{
        browser: "chromium" | "firefox";
        imageId?: string;
        preparerImageId?: string;
        target: "dev" | "runtime" | "standalone";
      }>;
    };
    e2eAttestedImageIds: Record<"runtime" | "standalone", string>;
    export?: {
      manifestDigest: string;
      manifestPath: string;
    };
    lifecycleValidatedImageIds: Record<"runtime" | "standalone", string>;
    releaseIdentity: string;
    targetImageIds: Record<"runtime" | "standalone", string>;
  };
  redisUrl: string;
  stages: CheckAllStageResult[];
}

export interface ApplicationLifecycleContext {
  buildId?: string;
  env: NodeJS.ProcessEnv;
  projectName: string;
  run: CommandRunner;
  signal: AbortSignal;
}

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
  imageBuilder?: ImageBuilder;
  projectName?: string;
  run?: CommandRunner;
  signals?: SignalSource;
}

const workspaceRoot = resolve(import.meta.dirname, "..");
const checkAllStages = [
  ["database", ["--filter", "@cat/db", "drizzle:push"]],
  ["integration", ["test:integration"]],
  [
    "compose-contract",
    [
      "exec",
      "vitest",
      "run",
      "scripts/compose-contract.test.ts",
      "--config",
      "scripts/vitest.integration.config.ts",
      "--reporter=agent",
    ],
  ],
  ["pglite", ["test:pglite"]],
  ["build", ["build:all"]],
  [
    "image-artifact-contract",
    [
      "exec",
      "vitest",
      "run",
      "scripts/image-artifact-contract.test.ts",
      "--config",
      "scripts/vitest.integration.config.ts",
      "--reporter=agent",
    ],
  ],
  ["artifacts", ["test:artifacts:verify"]],
] as const;

const defaultImageBuilder: ImageBuilder = async (context) =>
  await buildReleaseImages({
    buildId: context.buildId ?? context.projectName,
    env: context.env,
    run: context.run,
    signal: context.signal,
  });

const targetImageIds = (
  images: ReleaseImageBuildResult,
): Record<"runtime" | "standalone", string> => {
  const standalone = images.images.find(
    (image) => image.target === "standalone",
  )?.imageId;
  const runtime = images.images.find(
    (image) => image.target === "runtime",
  )?.imageId;
  if (standalone === undefined || runtime === undefined) {
    throw new Error(
      "Image build did not return both immutable release targets",
    );
  }
  return { runtime, standalone };
};

type E2EAttestationEvidence = CheckAllReport["images"]["e2eAttestation"];

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
  if (configured === "1" || configured === "2") return Number(configured);
  throw new Error("CAT_CHECK_ALL_E2E_CONCURRENCY must be 1 or 2");
};

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

  constructor(signal: CheckAllSignal) {
    super(`check:all interrupted by ${signal}`);
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
): Promise<CheckAllReport> => {
  const run = options.run ?? defaultRunner;
  const signals = options.signals ?? process;
  const log =
    options.log ?? ((message) => process.stdout.write(`${message}\n`));
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

  const throwIfInterrupted = (): void => {
    if (interruptedBy !== undefined) {
      throw new CheckAllInterruptedError(interruptedBy);
    }
  };
  const stages: CheckAllStageResult[] = [];
  const runOperationStage = async <Result>(
    name: string,
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    throwIfInterrupted();
    const startedAt = performance.now();
    log(
      JSON.stringify({
        event: "check-all.stage",
        stage: name,
        status: "started",
      }),
    );
    try {
      const result = await operation();
      throwIfInterrupted();
      const durationMs = Math.round(performance.now() - startedAt);
      stages.push({ name, durationMs });
      log(
        JSON.stringify({
          durationMs,
          event: "check-all.stage",
          stage: name,
          status: "passed",
        }),
      );
      return result;
    } catch (error) {
      // Node reports an AbortError from spawn before the signal handler's
      // lifecycle cleanup has returned; normalize it after release completes.
      throwIfInterrupted();
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
    const report = await runWithTestServiceLease(
      {
        environment: {
          ...baseEnv,
          ...(baseEnv.CAT_CHECK_ALL_POSTGRES_DB === undefined
            ? {}
            : { CAT_E2E_POSTGRES_DB: baseEnv.CAT_CHECK_ALL_POSTGRES_DB }),
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
        ...(dockerHost === undefined ? {} : { dockerHost }),
      },
      async (lease) => {
        const appPort = options.appPort ?? (await availablePort());
        const integrationEnv = {
          ...baseEnv,
          CAT_CHECK_ALL_BUILD_ID: buildId,
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
          run,
          signal: abortController.signal,
        };
        const applicationLifecycle =
          options.applicationLifecycle ?? runApplicationLifecycle;
        let images: ReleaseImageBuildResult | undefined;
        let imageIds: Record<"runtime" | "standalone", string> | undefined;
        let exportResult:
          | Awaited<ReturnType<typeof exportValidatedImages>>
          | undefined;
        let e2eAttestation: E2EAttestationEvidence | undefined;
        let lifecycleReport: ApplicationLifecycleReport | void;
        for (const [name, args] of checkAllStages) {
          await runStage(name, [...args], integrationEnv);
          if (name === "build") {
            images = await runOperationStage(
              "image-build",
              async () =>
                await (options.imageBuilder ?? defaultImageBuilder)(
                  lifecycleContext,
                ),
            );
            imageIds = targetImageIds(images);
            log(
              JSON.stringify({
                buildId,
                event: "check-all.image-mapping",
                releaseIdentity: buildId,
                stage: "image-build",
                targetImageIds: imageIds,
              }),
            );
            const attestationDirectory = await mkdtemp(
              join(tmpdir(), "cat-check-all-e2e-attestation-"),
            );
            const attestationPath = join(
              attestationDirectory,
              "release-e2e.json",
            );
            try {
              await runStage(
                "e2e",
                ["test:e2e", "--", "--concurrency", String(e2eConcurrency)],
                {
                  ...integrationEnv,
                  CAT_E2E_ATTESTATION_PATH: attestationPath,
                  CAT_E2E_RUNTIME_IMAGE_ID: imageIds.runtime,
                  CAT_E2E_STANDALONE_IMAGE_ID: imageIds.standalone,
                },
              );
              e2eAttestation = await readE2eAttestation(
                attestationPath,
                imageIds,
                buildId,
              );
            } finally {
              await rm(attestationDirectory, { force: true, recursive: true });
            }
            log(
              JSON.stringify({
                e2eAttestation,
                event: "check-all.image-mapping",
                releaseIdentity: buildId,
                stage: "e2e",
                targetImageIds: imageIds,
              }),
            );
            lifecycleReport = await runOperationStage(
              "container-lifecycle",
              async () => await applicationLifecycle(lifecycleContext, images),
            );
            log(
              JSON.stringify({
                event: "check-all.image-mapping",
                releaseIdentity: buildId,
                stage: "container-lifecycle",
                targetImageIds: lifecycleReport?.validatedImageIds ?? imageIds,
              }),
            );
            exportResult = await runOperationStage(
              "image-artifact",
              async () => await exportValidatedImages(lifecycleContext, images),
            );
            log(
              JSON.stringify({
                event: "check-all.image-mapping",
                export: exportResult,
                releaseIdentity: buildId,
                stage: "image-artifact",
                targetImageIds: lifecycleReport?.validatedImageIds ?? imageIds,
              }),
            );
          }
          throwIfInterrupted();
        }
        if (
          images === undefined ||
          imageIds === undefined ||
          e2eAttestation === undefined
        ) {
          throw new Error("check:all did not complete image construction");
        }
        return {
          databaseUrl: lease.coordinates.databaseUrl,
          images: {
            buildId,
            e2eAttestation,
            e2eAttestedImageIds: imageIds,
            ...(exportResult === undefined ? {} : { export: exportResult }),
            lifecycleValidatedImageIds:
              lifecycleReport?.validatedImageIds ?? imageIds,
            releaseIdentity: buildId,
            targetImageIds: imageIds,
          },
          projectName,
          redisUrl: lease.coordinates.redisUrl,
          stages,
        };
      },
    );
    throwIfInterrupted();
    return report;
  } catch (error) {
    throwIfInterrupted();
    throw error;
  } finally {
    for (const [signal, listener] of signalListeners) {
      signals.off(signal, listener);
    }
  }
};

const main = async (): Promise<void> => {
  try {
    const report = await runCheckAll({
      applicationLifecycle: runApplicationLifecycle,
      ...parseCheckAllCommand(process.argv.slice(2)),
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
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
