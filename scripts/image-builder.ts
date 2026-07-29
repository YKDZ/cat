import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
) => Promise<{ stdout: string }>;

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
  run: ImageBuildCommandRunner;
  signal: AbortSignal;
  targets?: ReleaseImageTarget[];
};

export type ImageBuildCliOptions = Omit<
  BuildReleaseImagesOptions,
  "targets"
> & {
  args: string[];
  write: (value: string) => void;
};

const workspaceRoot = resolve(import.meta.dirname, "..");
const dockerfile = "apps/app/Dockerfile";
const immutableImageId = /^sha256:[a-f0-9]{64}$/;

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
      const iidfile = join(temporaryDirectory, `${target}.iid`);
      await options.run(
        "docker",
        [
          "build",
          "--file",
          dockerfile,
          "--target",
          target,
          "--build-arg",
          `DEPLOYMENT_BUILD_ID=${options.buildId}`,
          "--iidfile",
          iidfile,
          ".",
        ],
        {
          cwd,
          env: options.env,
          signal: options.signal,
          stdio: "inherit",
        },
      );
      const iid = await readFile(iidfile, "utf8");
      images.push({ imageId: readImageId(iid, target), target });
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
): Promise<ReleaseImageBuildResult> => {
  const result = await buildReleaseImages({
    ...options,
    targets: parseImageBuildArguments(options.args),
  });
  options.write(`${JSON.stringify(result)}\n`);
  return result;
};

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
      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        stdout += chunk;
        if (commandOptions.stdio === "inherit") process.stderr.write(chunk);
      });
      child.stderr?.pipe(process.stderr, { end: false });
      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) resolveResult({ stdout });
        else
          reject(
            new Error(
              `${command} ${args.join(" ")} exited with ${String(code)}`,
            ),
          );
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
    });
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
