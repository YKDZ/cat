import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateBuildxCachePaths,
  type BuildxCacheTarget,
} from "./buildx-cache.ts";

export const releaseImageTargets = ["standalone", "runtime"] as const;

export type ReleaseImageTarget = (typeof releaseImageTargets)[number];

export type ImageBuildCommandOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
  stdio: "inherit" | "pipe";
};

export type ImageBuildCommandRunner = (
  command: string,
  args: string[],
  options: ImageBuildCommandOptions,
) => Promise<{ stderr?: string; stdout: string }>;

export type ReleaseImage = {
  imageId: string;
  target: ReleaseImageTarget;
};

export type ReleaseImageBuildResult = {
  images: ReleaseImage[];
};

export type ReleaseImageCapability = {
  command: string;
  description: string;
};

export type ValidatedImageArtifact = ReleaseImage & {
  identity: ReleaseImageCapability & {
    versionLabel: string;
  };
};

export type ValidatedImageManifest = {
  images: Record<ReleaseImageTarget, ValidatedImageArtifact>;
  schemaVersion: 1;
};

export type BuildReleaseImagesOptions = {
  buildId: string;
  cwd?: string;
  env: NodeJS.ProcessEnv;
  report?: (value: string) => void;
  reportError?: (value: string) => void;
  run: ImageBuildCommandRunner;
  signal: AbortSignal;
  targets?: ReleaseImageTarget[];
};

export type ImageBuildCliOptions = Omit<
  BuildReleaseImagesOptions,
  "report" | "targets"
> & {
  args: string[];
  write: (value: string) => void;
  writeError: (value: string) => void;
};

type BuildxMetadata = {
  "buildx.build.warnings"?: unknown;
};

type BuildxCache = {
  from?: string;
  inputAvailable: boolean;
  outputConfigured: boolean;
  to?: string;
};

const workspaceRoot = resolve(import.meta.dirname, "..");
const dockerfile = "apps/app/Dockerfile";
const immutableImageId = /^sha256:[a-f0-9]{64}$/;
const writeProcessStderr = (value: string): void => process.stderr.write(value);

const isReleaseImageTarget = (value: string): value is ReleaseImageTarget =>
  value === "standalone" || value === "runtime";

export const releaseImageCapability = (
  target: ReleaseImageTarget,
): ReleaseImageCapability =>
  target === "standalone"
    ? {
        command: "prepare-and-start",
        description: "CAT standalone application with database preparation",
      }
    : {
        command: "start-only",
        description: "CAT start-only application runtime",
      };

export const createValidatedImageManifest = (
  images: ReleaseImageBuildResult,
  versionLabel: string,
): ValidatedImageManifest => {
  const artifact = (target: ReleaseImageTarget): ValidatedImageArtifact => {
    const image = images.images.find(
      (candidate) => candidate.target === target,
    );
    if (image === undefined) {
      throw new Error(`Missing immutable ${target} image for artifact export`);
    }
    return {
      ...image,
      identity: { ...releaseImageCapability(target), versionLabel },
    };
  };
  return {
    images: {
      runtime: artifact("runtime"),
      standalone: artifact("standalone"),
    },
    schemaVersion: 1,
  };
};

export const parseImageBuildArguments = (
  args: string[],
): ReleaseImageTarget[] => {
  const commandArgs = args[0] === "--" ? args.slice(1) : args;
  if (commandArgs.length === 0) return [...releaseImageTargets];
  if (commandArgs.length !== 2 || commandArgs[0] !== "--target") {
    throw new Error("Usage: image-builder.ts [--target <standalone|runtime>]");
  }
  const target = commandArgs[1];
  if (target === undefined || !isReleaseImageTarget(target)) {
    throw new Error(`Unknown image target ${JSON.stringify(target)}`);
  }
  return [target];
};

const readImageId = (value: string, target: ReleaseImageTarget): string => {
  const imageId = value.trim();
  if (!immutableImageId.test(imageId)) {
    throw new Error(
      `Docker did not return an immutable local image ID for ${target}`,
    );
  }
  return imageId;
};

const preexistingImageIds = (value: string): Set<string> =>
  new Set(
    value.split(/\s+/).filter((candidate) => immutableImageId.test(candidate)),
  );

const optionalBuildxCache = (
  paths: { output?: string; source?: string },
  sourceScopes: Record<BuildxCacheTarget, boolean>,
  target: BuildxCacheTarget,
): BuildxCache => {
  const sourceScope =
    paths.source === undefined ? undefined : join(paths.source, target);
  const outputScope =
    paths.output === undefined ? undefined : join(paths.output, target);
  const inputAvailable = sourceScope !== undefined && sourceScopes[target];
  return {
    ...(inputAvailable ? { from: `type=local,src=${sourceScope}` } : {}),
    inputAvailable,
    outputConfigured: outputScope !== undefined,
    ...(outputScope === undefined
      ? {}
      : { to: `type=local,dest=${outputScope},mode=max,ignore-error=true` }),
  };
};

const buildxSecrets = (env: NodeJS.ProcessEnv): string[] => {
  const entries = [
    ["turbo_team", "TURBO_TEAM"],
    ["turbo_token", "TURBO_TOKEN"],
    ["turbo_remote_cache_signature_key", "TURBO_REMOTE_CACHE_SIGNATURE_KEY"],
  ] as const;
  return entries.flatMap(([id, name]) =>
    env[name] === undefined || env[name] === ""
      ? []
      : ["--secret", `id=${id},env=${name}`],
  );
};

const readBuildxWarnings = async (path: string): Promise<unknown[]> => {
  let value: BuildxMetadata;
  try {
    value = JSON.parse(await readFile(path, "utf8")) as BuildxMetadata;
  } catch {
    return [];
  }
  const warnings = value["buildx.build.warnings"];
  if (Array.isArray(warnings)) return warnings;
  if (typeof warnings === "object" && warnings !== null) {
    return Object.values(warnings);
  }
  return [];
};

const replayFailedBuildHistory = async (
  options: BuildReleaseImagesOptions,
  cwd: string,
): Promise<void> => {
  try {
    const history = await options.run(
      "docker",
      [
        "buildx",
        "history",
        "ls",
        "--filter",
        "status=error",
        "--format",
        "{{.Ref}}",
      ],
      { cwd, env: options.env, signal: options.signal, stdio: "pipe" },
    );
    const reference = history.stdout.trim().split("\n")[0];
    if (reference === undefined || reference === "") return;
    const historyLogs = await options.run(
      "docker",
      ["buildx", "history", "logs", "--progress=plain", reference],
      { cwd, env: options.env, signal: options.signal, stdio: "pipe" },
    );
    if (historyLogs.stdout !== "") {
      (options.reportError ?? writeProcessStderr)(historyLogs.stdout);
    }
  } catch {
    // Build history is advisory evidence. Preserve the original build failure.
  }
};

const buildxArguments = (
  target: ReleaseImageTarget,
  buildId: string,
  iidfile: string,
  metadataFile: string,
  cache: BuildxCache,
  env: NodeJS.ProcessEnv,
): string[] => [
  "buildx",
  "build",
  "--file",
  dockerfile,
  "--target",
  target,
  "--load",
  "--progress=quiet",
  "--iidfile",
  iidfile,
  "--metadata-file",
  metadataFile,
  "--build-arg",
  `DEPLOYMENT_BUILD_ID=${buildId}`,
  ...(cache.from === undefined ? [] : ["--cache-from", cache.from]),
  ...(cache.to === undefined ? [] : ["--cache-to", cache.to]),
  ...buildxSecrets(env),
  ".",
];

export const buildReleaseImages = async (
  options: BuildReleaseImagesOptions,
): Promise<ReleaseImageBuildResult> => {
  const targets = options.targets ?? [...releaseImageTargets];
  if (targets.length === 0) {
    throw new Error("At least one release image target is required");
  }
  if (new Set(targets).size !== targets.length) {
    throw new Error("Each release image target may only be selected once");
  }
  const cwd = options.cwd ?? workspaceRoot;
  const turboRemoteCacheConfigured =
    options.env.TURBO_TEAM !== undefined &&
    options.env.TURBO_TEAM !== "" &&
    options.env.TURBO_TOKEN !== undefined &&
    options.env.TURBO_TOKEN !== "";
  const cachePaths = await validateBuildxCachePaths({
    allowedCacheRoot: ".cache",
    cwd,
    output: options.env.CAT_BUILDX_CACHE_OUTPUT,
    source: options.env.CAT_BUILDX_CACHE_SOURCE,
  });
  if (!cachePaths.valid) {
    options.report?.(
      `container cache warning: invalid Buildx cache configuration: ${cachePaths.message}\n`,
    );
  }
  const images: ReleaseImage[] = [];
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "cat-image-build-"));
  let preexisting = new Set<string>();
  try {
    const existing = await options.run(
      "docker",
      ["image", "ls", "--all", "--quiet", "--no-trunc"],
      { cwd, env: options.env, signal: options.signal, stdio: "pipe" },
    );
    preexisting = preexistingImageIds(existing.stdout);
    for (const target of targets) {
      const cache = optionalBuildxCache(
        cachePaths.paths,
        cachePaths.valid
          ? cachePaths.sourceScopes
          : { runtime: false, standalone: false },
        target,
      );
      const iidfile = join(temporaryDirectory, `${target}.iid`);
      const metadataFile = join(temporaryDirectory, `${target}.metadata.json`);
      const startedAt = performance.now();
      try {
        await options.run(
          "docker",
          buildxArguments(
            target,
            options.buildId,
            iidfile,
            metadataFile,
            cache,
            options.env,
          ),
          {
            cwd,
            env: { ...options.env, BUILDX_METADATA_WARNINGS: "1" },
            signal: options.signal,
            stdio: "pipe",
          },
        );
      } catch (error) {
        await replayFailedBuildHistory(options, cwd);
        throw error;
      }
      const imageId = readImageId(await readFile(iidfile, "utf8"), target);
      images.push({ imageId, target });
      const durationSeconds = ((performance.now() - startedAt) / 1_000).toFixed(
        1,
      );
      options.report?.(
        `image target=${target} duration=${durationSeconds}s image=${imageId} external-cache-input=${cache.inputAvailable ? "available" : "unavailable"} external-cache-output=${cache.outputConfigured ? "configured" : "not-configured"} turbo-remote-cache=${turboRemoteCacheConfigured ? "configured" : "not-configured"}\n`,
      );
      for (const warning of await readBuildxWarnings(metadataFile)) {
        options.report?.(
          `image warning target=${target} ${JSON.stringify(warning)}\n`,
        );
      }
    }
    return { images };
  } catch (error) {
    const cleanupSignal = AbortSignal.timeout(30_000);
    await Promise.allSettled(
      images
        .filter((image) => !preexisting.has(image.imageId))
        .map(
          async (image) =>
            await options.run(
              "docker",
              ["image", "rm", "--force", image.imageId],
              {
                cwd,
                env: options.env,
                signal: cleanupSignal,
                stdio: "inherit",
              },
            ),
        ),
    );
    throw error;
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
};

export const runImageBuildCli = async (
  options: ImageBuildCliOptions,
): Promise<ReleaseImageBuildResult> =>
  await buildReleaseImages({
    ...options,
    report: options.write,
    reportError: options.writeError,
    targets: parseImageBuildArguments(options.args),
  });

const directExecution = (): boolean =>
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (directExecution()) {
  const { spawn } = await import("node:child_process");
  const run: ImageBuildCommandRunner = async (command, args, commandOptions) =>
    await new Promise((resolveResult, reject) => {
      const child = spawn(command, args, {
        cwd: commandOptions.cwd,
        env: commandOptions.env,
        signal: commandOptions.signal,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        stdout += chunk;
        if (commandOptions.stdio === "inherit") process.stderr.write(chunk);
      });
      child.stderr?.on("data", (chunk: string) => {
        stderr += chunk;
        if (commandOptions.stdio === "inherit") process.stderr.write(chunk);
      });
      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) resolveResult({ stderr, stdout });
        else {
          if (stderr !== "") process.stderr.write(stderr);
          reject(
            new Error(
              `${command} ${args.join(" ")} exited with ${String(code)}`,
            ),
          );
        }
      });
    });
  try {
    await runImageBuildCli({
      args: process.argv.slice(2),
      buildId: process.env.DEPLOYMENT_BUILD_ID ?? "local",
      env: process.env,
      run,
      signal: new AbortController().signal,
      write: (value) => process.stdout.write(value),
      writeError: (value) => process.stderr.write(value),
    });
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
