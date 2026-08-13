import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  imageBuildFamilyTargets,
  releaseImageTargets,
  type ImageBuildFamily,
  type ReleaseImageTarget,
} from "./image-builder.ts";
import {
  cleanupCandidateImageArtifacts,
  initializeCandidateImageArtifacts,
  loadCandidateImageFamily,
  loadCandidateImageBundles,
  verifyCandidateImageFamily,
  verifyCandidateImageBundles,
  type CandidateImage,
  type CandidateImageFamilyManifest,
  type CandidateImageManifest,
  type CandidateIdentity,
} from "./image-candidates.ts";
import { releaseImageTags } from "./release-image-tags.ts";

const root = resolve(import.meta.dirname, "..");

export type ImageArtifactCommandRunner = (
  command: string,
  args: string[],
) => Promise<string>;

export type PublishImageArtifactOptions = {
  env?: NodeJS.ProcessEnv;
  expectedIdentity: CandidateIdentity;
  ownerToken: string;
  readApplicationManifest?: () => Promise<{ version?: unknown }>;
  report?: (message: string) => void;
  run?: ImageArtifactCommandRunner;
};

export type VerifyAndLoadImageArtifactOptions = {
  expectedIdentity: CandidateIdentity;
  ownerToken: string;
  report?: (message: string) => void;
  run?: ImageArtifactCommandRunner;
};

export type VerifyAndLoadImageFamilyArtifactOptions =
  VerifyAndLoadImageArtifactOptions;

const defaultRun: ImageArtifactCommandRunner = async (command, args) =>
  await new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolveResult(stdout);
      else reject(new Error(`${command} ${args.join(" ")} failed: ${stderr}`));
    });
  });

const readApplicationVersion = async (
  readApplicationManifest: () => Promise<{ version?: unknown }>,
): Promise<string> => {
  const version = (await readApplicationManifest()).version;
  if (typeof version !== "string") {
    throw new Error("Application package manifest has no release version");
  }
  return version;
};

const verifyLoadedCandidate = async (
  target: ReleaseImageTarget,
  artifact: CandidateImage,
  run: ImageArtifactCommandRunner,
  report: (message: string) => void,
): Promise<void> => {
  const imageId = (
    await run("docker", [
      "image",
      "inspect",
      "--format",
      "{{.Id}}",
      artifact.imageId,
    ])
  ).trim();
  const version = (
    await run("docker", [
      "image",
      "inspect",
      "--format",
      '{{ index .Config.Labels "org.opencontainers.image.version" }}',
      artifact.imageId,
    ])
  ).trim();
  const description = (
    await run("docker", [
      "image",
      "inspect",
      "--format",
      '{{ index .Config.Labels "org.opencontainers.image.description" }}',
      artifact.imageId,
    ])
  ).trim();
  const command = (
    await run("docker", [
      "image",
      "inspect",
      "--format",
      "{{ index .Config.Cmd 0 }}",
      artifact.imageId,
    ])
  ).trim();
  if (
    imageId !== artifact.imageId ||
    version !== artifact.releaseIdentity ||
    description !== artifact.capability.description ||
    command !== artifact.capability.command
  ) {
    throw new Error(`Loaded ${target} image does not match its manifest`);
  }
  report(`image-artifact target=${target} image=${imageId} verified-loaded\n`);
};

export const verifyAndLoadImageFamilyArtifacts = async (
  directory: string,
  family: ImageBuildFamily,
  options: VerifyAndLoadImageFamilyArtifactOptions,
): Promise<CandidateImageFamilyManifest> => {
  const manifest = await verifyCandidateImageFamily(
    directory,
    options.ownerToken,
    family,
    options.expectedIdentity,
  );
  const run = options.run ?? defaultRun;
  const report =
    options.report ?? ((message: string) => process.stdout.write(message));
  await loadCandidateImageFamily(
    directory,
    options.ownerToken,
    manifest,
    async (args) => await run("docker", args),
  );
  for (const target of imageBuildFamilyTargets(family)) {
    const artifact = manifest.candidates[target];
    if (artifact === undefined) {
      throw new Error(`Candidate ${family} family is missing ${target}`);
    }
    await verifyLoadedCandidate(target, artifact, run, report);
  }
  return manifest;
};

export const verifyAndLoadImageArtifacts = async (
  directory: string,
  options: VerifyAndLoadImageArtifactOptions,
): Promise<CandidateImageManifest> => {
  const manifest = await verifyCandidateImageBundles(
    directory,
    options.ownerToken,
    options.expectedIdentity,
  );
  const run = options.run ?? defaultRun;
  const report =
    options.report ?? ((message: string) => process.stdout.write(message));
  await loadCandidateImageBundles(
    directory,
    options.ownerToken,
    manifest,
    async (args) => await run("docker", args),
  );
  for (const target of releaseImageTargets) {
    const artifact = manifest.candidates[target];
    await verifyLoadedCandidate(target, artifact, run, report);
  }
  return manifest;
};

export const publishImageArtifacts = async (
  directory: string,
  options: PublishImageArtifactOptions,
): Promise<void> => {
  const manifest = await verifyCandidateImageBundles(
    directory,
    options.ownerToken,
    options.expectedIdentity,
  );
  const env = options.env ?? process.env;
  const image = env.IMAGE;
  const revision = env.GITHUB_SHA;
  if (revision !== options.expectedIdentity.commitIdentity) {
    throw new Error("GITHUB_SHA does not match the expected candidate commit");
  }
  const version = await readApplicationVersion(
    options.readApplicationManifest ??
      (async () =>
        JSON.parse(
          await readFile(join(root, "apps/app/package.json"), "utf8"),
        ) as { version?: unknown }),
  );
  const run = options.run ?? defaultRun;
  const report =
    options.report ?? ((message: string) => process.stdout.write(message));
  if (image === undefined || revision === undefined) {
    throw new Error(
      "IMAGE and GITHUB_SHA are required to publish validated images",
    );
  }
  for (const target of releaseImageTargets) {
    const source = manifest.candidates[target].imageId;
    for (const tag of releaseImageTags(image, version, revision, target)) {
      await run("docker", ["image", "tag", source, tag]);
      await run("docker", ["image", "push", "--quiet", tag]);
      report(`image-release target=${target} tag=${tag} pushed\n`);
    }
  }
};

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const [command, argumentDirectory] = process.argv.slice(2);
  const directory = argumentDirectory ?? process.env.CAT_IMAGE_CANDIDATE_DIR;
  const ownerToken = process.env.CAT_IMAGE_CANDIDATE_OWNER_TOKEN;
  if (directory === undefined || directory === "") {
    throw new Error(
      "CAT_IMAGE_CANDIDATE_DIR or an explicit directory is required",
    );
  }
  if (ownerToken === undefined || ownerToken === "") {
    throw new Error("CAT_IMAGE_CANDIDATE_OWNER_TOKEN is required");
  }
  if (command === "init") {
    await initializeCandidateImageArtifacts(directory, ownerToken);
  } else if (command === "cleanup") {
    await cleanupCandidateImageArtifacts(directory, ownerToken);
  } else {
    throw new Error("Usage: image-artifacts.ts <init|cleanup> [directory]");
  }
}
