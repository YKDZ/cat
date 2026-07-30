// oxlint-disable no-console -- the E2E command reports child-process failures directly
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { redactDiagnosticText } from "@cat/shared";

import { runExecutionCells, runManagedCommand } from "./execution-cell.ts";
import type { ExecutionBrowser, ExecutionCellInput } from "./execution-cell.ts";
import {
  assertReleaseE2eImage,
  type AttestedReleaseE2eImage,
} from "./release-e2e-image.ts";
import {
  attestTestServiceLease,
  parseTestServiceLease,
  runWithTestServiceLease,
  type ServiceLeaseCommandRunner,
} from "./test-service-lease.ts";

type E2ESignal = "SIGINT" | "SIGTERM";

class DirectE2EInterruptedError extends Error {
  readonly signal: E2ESignal;

  constructor(signal: E2ESignal) {
    super(`E2E interrupted by ${signal}`);
    this.name = "DirectE2EInterruptedError";
    this.signal = signal;
  }
}

export const runDocker: ServiceLeaseCommandRunner = async (
  command,
  args,
  options,
) => {
  try {
    const result = await runManagedCommand(
      command,
      args,
      options.env,
      `${command} ${args.join(" ")}`,
      {
        cwd: options.cwd,
        signal: options.signal,
        stdio: options.stdio === "pipe" ? "capture" : "inherit",
      },
    );
    return { stdout: result.stdout };
  } catch (error) {
    throw new Error(
      redactDiagnosticText(
        error instanceof Error ? error.message : String(error),
      ),
      { cause: error },
    );
  }
};

type RequestedTarget = "all" | "dev" | "standalone" | "runtime";

export type E2ESelection = {
  browser?: ExecutionBrowser;
  target: RequestedTarget;
};

export type E2ECommand = {
  concurrency: 1 | 2;
  retryFailedCells: boolean;
  selection: E2ESelection;
};

export type ReleaseE2EImageIds = {
  releaseIdentity?: string;
  runtimeImageId?: string;
  standaloneImageId?: string;
};

export type E2EAttestationCell = {
  browser: ExecutionBrowser;
  imageId?: string;
  preparerImageId?: string;
  target: Exclude<RequestedTarget, "all">;
};

export type E2EAttestationReport = {
  cells: E2EAttestationCell[];
  releaseImages: ReleaseE2EImageIds;
};

export const assertRuntimeImagePair = (
  standalone: AttestedReleaseE2eImage,
  runtime: AttestedReleaseE2eImage,
): ReleaseE2EImageIds => {
  if (standalone.releaseIdentity !== runtime.releaseIdentity) {
    throw new Error(
      "Runtime selection requires runtime and standalone preparer images from the same release identity",
    );
  }
  return {
    releaseIdentity: standalone.releaseIdentity,
    runtimeImageId: runtime.imageId,
    standaloneImageId: standalone.imageId,
  };
};

export const writeE2eAttestation = async (
  path: string | undefined,
  cells: readonly ExecutionCellInput[],
  releaseImages: ReleaseE2EImageIds,
): Promise<E2EAttestationReport | undefined> => {
  if (path === undefined || path === "") return undefined;
  const report = {
    cells: cells.map((cell) => ({
      browser: cell.browser,
      ...("imageId" in cell ? { imageId: cell.imageId } : {}),
      ...("preparerImageId" in cell
        ? { preparerImageId: cell.preparerImageId }
        : {}),
      target: cell.target,
    })),
    releaseImages,
  } satisfies E2EAttestationReport;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report)}\n`);
  return report;
};

export const parseE2ESelection = (args: string[]): E2ESelection => {
  const commandArgs = args[0] === "--" ? args.slice(1) : args;
  if (commandArgs.length === 0) return { target: "all" };
  let browser: ExecutionBrowser | undefined;
  let target: RequestedTarget | undefined;
  for (let index = 0; index < commandArgs.length; index += 2) {
    const flag = commandArgs[index];
    const value = commandArgs[index + 1];
    if (value === undefined || (flag !== "--target" && flag !== "--browser")) {
      throw new Error(
        "Usage: test-e2e.ts [--target <all|dev|standalone|runtime>] [--browser <chromium|firefox>]",
      );
    }
    if (
      flag === "--target" &&
      (value === "all" ||
        value === "dev" ||
        value === "standalone" ||
        value === "runtime")
    ) {
      target = value;
    } else if (
      flag === "--browser" &&
      (value === "chromium" || value === "firefox")
    ) {
      browser = value;
    } else {
      throw new Error(
        "Usage: test-e2e.ts [--target <all|dev|standalone|runtime>] [--browser <chromium|firefox>]",
      );
    }
  }
  if (target === undefined || (target === "dev" && browser === "firefox")) {
    throw new Error(
      "Development E2E supports Chromium only; release targets require an explicit target.",
    );
  }
  return { ...(browser === undefined ? {} : { browser }), target };
};

export const parseE2ECommand = (args: string[]): E2ECommand => {
  let concurrency: 1 | 2 = 2;
  let concurrencyWasProvided = false;
  let retryFailedCells = false;
  const selectionArgs: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) {
      throw new Error("E2E command arguments could not be read");
    }
    if (argument === "--concurrency") {
      if (concurrencyWasProvided) {
        throw new Error("--concurrency may only be supplied once");
      }
      const value = args[index + 1];
      if (value === "1") {
        concurrency = 1;
      } else if (value === "2") {
        concurrency = 2;
      } else {
        throw new Error("--concurrency must be 1 or 2");
      }
      concurrencyWasProvided = true;
      index += 1;
      continue;
    }
    if (argument !== "--retry-failed-cells") {
      selectionArgs.push(argument);
      continue;
    }
    if (retryFailedCells) {
      throw new Error("--retry-failed-cells may only be supplied once");
    }
    retryFailedCells = true;
  }
  return {
    concurrency,
    retryFailedCells,
    selection: parseE2ESelection(selectionArgs),
  };
};

export const cellsForSelection = async (
  selection: E2ESelection,
  lease: Parameters<typeof runExecutionCells>[0][number]["lease"],
  images: ReleaseE2EImageIds = {},
): Promise<ExecutionCellInput[]> => {
  if (selection.target === "all") {
    const cells: ExecutionCellInput[] = [];
    if (selection.browser !== "firefox") {
      cells.push(
        ...(await cellsForSelection({ target: "dev" }, lease, images)),
      );
    }
    for (const target of ["standalone", "runtime"] as const) {
      cells.push(
        ...(await cellsForSelection(
          {
            ...(selection.browser === undefined
              ? {}
              : { browser: selection.browser }),
            target,
          },
          lease,
          images,
        )),
      );
    }
    return cells;
  }
  if (selection.target === "dev") {
    return [{ browser: "chromium", lease, target: "dev" }];
  }
  if (
    selection.target === "standalone" &&
    images.standaloneImageId === undefined
  ) {
    throw new Error(
      "Standalone selection did not resolve an immutable image ID",
    );
  }
  if (
    selection.target === "runtime" &&
    (images.runtimeImageId === undefined ||
      images.standaloneImageId === undefined)
  ) {
    throw new Error(
      "Runtime selection requires explicit runtime and standalone preparer image IDs",
    );
  }
  const browsers =
    selection.browser === undefined
      ? (["chromium", "firefox"] as const)
      : [selection.browser];
  if (selection.target === "standalone") {
    return browsers.map((browser) => ({
      browser,
      imageId: images.standaloneImageId!,
      lease,
      target: "standalone",
    }));
  }
  return browsers.map((browser) => ({
    browser,
    imageId: images.runtimeImageId!,
    lease,
    preparerImageId: images.standaloneImageId!,
    target: "runtime",
  }));
};

const assertReleaseImages = async (
  selection: E2ESelection,
  signal: AbortSignal,
): Promise<ReleaseE2EImageIds> => {
  if (selection.target === "dev") return {};
  const standalone = await assertReleaseE2eImage({
    env: process.env,
    imageId: process.env.CAT_E2E_STANDALONE_IMAGE_ID,
    run: runDocker,
    signal,
    target: "standalone",
  });
  if (selection.target === "standalone") {
    return {
      releaseIdentity: standalone.releaseIdentity,
      standaloneImageId: standalone.imageId,
    };
  }
  const runtime = await assertReleaseE2eImage({
    env: process.env,
    imageId: process.env.CAT_E2E_RUNTIME_IMAGE_ID,
    run: runDocker,
    signal,
    target: "runtime",
  });
  return assertRuntimeImagePair(standalone, runtime);
};

const main = async (signal: AbortSignal): Promise<void> => {
  const command = parseE2ECommand(process.argv.slice(2));
  const { selection } = command;
  // Release identities are attested before acquiring a lease, so an invalid
  // invocation cannot create mutable test infrastructure.
  const images = await assertReleaseImages(selection, signal);
  const externalLease = process.env.CAT_TEST_SERVICE_LEASE;
  const lease =
    externalLease === undefined
      ? undefined
      : parseTestServiceLease(externalLease);
  const leaseOptions = {
    environment: process.env,
    run: runDocker,
    signal,
    ...(process.env.CAT_E2E_DOCKER_HOST === undefined
      ? {}
      : { dockerHost: process.env.CAT_E2E_DOCKER_HOST }),
  };
  if (lease !== undefined) await attestTestServiceLease(lease, leaseOptions);
  await runWithTestServiceLease(
    lease === undefined ? leaseOptions : { ...leaseOptions, lease },
    async (currentLease) => {
      if (signal.aborted) throw signal.reason;
      const inherited = {
        DATABASE_URL: process.env.DATABASE_URL,
        REDIS_URL: process.env.REDIS_URL,
        SPACY_SERVER_URL: process.env.SPACY_SERVER_URL,
      };
      process.env.DATABASE_URL = currentLease.coordinates.databaseUrl;
      process.env.REDIS_URL = currentLease.coordinates.redisUrl;
      process.env.SPACY_SERVER_URL = currentLease.coordinates.spacyUrl;
      try {
        const cells = await cellsForSelection(selection, currentLease, images);
        const completedCells = await runExecutionCells(cells, {
          concurrency: command.concurrency,
          retryFailedCells: command.retryFailedCells,
          signal,
        });
        await writeE2eAttestation(
          process.env.CAT_E2E_ATTESTATION_PATH,
          completedCells,
          images,
        );
      } finally {
        for (const [key, value] of Object.entries(inherited)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    },
  );
};

const directMain = async (): Promise<void> => {
  const controller = new AbortController();
  let interruptedBy: E2ESignal | undefined;
  const handlers = new Map<E2ESignal, () => void>();
  for (const processSignal of ["SIGINT", "SIGTERM"] as const) {
    const handler = (): void => {
      interruptedBy ??= processSignal;
      controller.abort();
    };
    handlers.set(processSignal, handler);
    process.on(processSignal, handler);
  }
  try {
    await main(controller.signal);
    if (interruptedBy !== undefined)
      throw new DirectE2EInterruptedError(interruptedBy);
  } catch (error) {
    if (interruptedBy !== undefined)
      throw new DirectE2EInterruptedError(interruptedBy);
    throw error;
  } finally {
    for (const [processSignal, handler] of handlers) {
      process.off(processSignal, handler);
    }
  }
};

const directExecution = (): boolean =>
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

export const formatE2EDiagnostic = (error: unknown): string =>
  redactDiagnosticText(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );

if (directExecution()) {
  try {
    await directMain();
  } catch (error) {
    process.stderr.write(`${formatE2EDiagnostic(error)}\n`);
    process.exitCode =
      error instanceof DirectE2EInterruptedError
        ? error.signal === "SIGINT"
          ? 130
          : 143
        : 1;
  }
}
