import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import { validateBuildxCachePaths } from "./buildx-cache.ts";
import { releaseImageTargets } from "./image-builder.ts";

type CacheFileSystem = {
  rename: (from: string, to: string) => Promise<void>;
  rm: (
    path: string,
    options: { force: boolean; recursive: boolean },
  ) => Promise<void>;
};

export type CachePromotionOptions = {
  allowedCacheRoot?: string;
  cwd?: string;
  env: NodeJS.ProcessEnv;
  fs?: CacheFileSystem;
  warning?: (message: string) => void;
  write?: (message: string) => void;
};

type CiCheckAllRunner = (command: string, args: string[]) => Promise<void>;

export type RunCiCheckAllOptions = {
  env?: NodeJS.ProcessEnv;
  promoteCache?: (options: CachePromotionOptions) => Promise<void>;
  run?: CiCheckAllRunner;
  writeChecksums?: (directory: string | undefined) => Promise<void>;
};

const run = async (command: string, args: string[]): Promise<void> =>
  await new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { env: process.env, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolveResult();
      else
        reject(
          new Error(`${command} ${args.join(" ")} exited with ${String(code)}`),
        );
    });
  });

export const promoteBuildxCache = async (
  options: CachePromotionOptions,
): Promise<void> => {
  const output = options.env.CAT_BUILDX_CACHE_OUTPUT;
  const destination = options.env.CAT_BUILDX_CACHE_SOURCE;
  if (
    output === undefined ||
    output === "" ||
    destination === undefined ||
    destination === ""
  ) {
    return;
  }
  const warning =
    options.warning ?? ((message) => process.stderr.write(message));
  const write = options.write ?? ((message) => process.stdout.write(message));
  const paths = await validateBuildxCachePaths({
    allowedCacheRoot: options.allowedCacheRoot ?? ".cache",
    cwd: options.cwd ?? process.cwd(),
    output,
    requireOutputMarkers: true,
    source: destination,
  });
  if (
    !paths.valid ||
    paths.paths.output === undefined ||
    paths.paths.source === undefined
  ) {
    warning(
      `container cache warning: invalid Buildx cache configuration: ${paths.valid ? "source and output are required for promotion" : paths.message}\n`,
    );
    return;
  }
  const fs = options.fs ?? {
    rename: async (from: string, to: string): Promise<void> =>
      await rename(from, to),
    rm: async (
      path: string,
      rmOptions: { force: boolean; recursive: boolean },
    ): Promise<void> => await rm(path, rmOptions),
  };
  const previous = `${paths.paths.source}.previous-${process.pid}`;
  let previousMoved = false;
  try {
    try {
      await lstat(previous);
      throw new Error(`previous Buildx cache path already exists: ${previous}`);
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ENOENT")
      ) {
        throw error;
      }
    }
    try {
      await fs.rename(paths.paths.source, previous);
      previousMoved = true;
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ENOENT")
      ) {
        throw error;
      }
    }
    try {
      await fs.rename(paths.paths.output, paths.paths.source);
    } catch (error) {
      if (previousMoved) {
        await fs.rename(previous, paths.paths.source);
        previousMoved = false;
      }
      throw error;
    }
    if (previousMoved) {
      await fs.rm(previous, { force: true, recursive: true });
    }
  } catch (error) {
    warning(
      `container cache warning: could not promote Buildx cache: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return;
  }
  write("container external-cache=saved\n");
};

const sha256 = async (path: string): Promise<string> => {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
};

export const writeImageChecksums = async (
  directory: string | undefined,
  write: (message: string) => void = (message) => process.stdout.write(message),
): Promise<void> => {
  if (directory === undefined || directory === "") return;
  const files = [
    "manifest.json",
    ...releaseImageTargets.map((target) => `${target}.tar`),
  ];
  const checksums: string[] = [];
  for (const file of files) {
    checksums.push(`${await sha256(`${directory}/${file}`)}  ${file}`);
  }
  await writeFile(`${directory}/SHA256SUMS`, `${checksums.join("\n")}\n`);
  write(`image-artifact directory=${directory} checksums=written\n`);
};

export const runCiCheckAll = async (
  options: RunCiCheckAllOptions = {},
): Promise<void> => {
  const env = options.env ?? process.env;
  await (options.run ?? run)("pnpm", [
    "check:all",
    "--",
    "--e2e-concurrency",
    "1",
  ]);
  await (options.writeChecksums ?? writeImageChecksums)(
    env.CAT_CHECK_ALL_EXPORT_IMAGES_DIR,
  );
  await (options.promoteCache ?? promoteBuildxCache)({ env });
};

const directExecution =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (directExecution) await runCiCheckAll();
