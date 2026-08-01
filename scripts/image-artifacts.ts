import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import {
  releaseImageCapability,
  releaseImageTargets,
  type ValidatedImageManifest,
} from "./image-builder.ts";
import { releaseImageTags } from "./release-image-tags.ts";

const root = resolve(import.meta.dirname, "..");

export type ImageArtifactCommandRunner = (
  command: string,
  args: string[],
) => Promise<string>;

export type PublishImageArtifactOptions = {
  env?: NodeJS.ProcessEnv;
  readApplicationManifest?: () => Promise<{ version?: unknown }>;
  report?: (message: string) => void;
  run?: ImageArtifactCommandRunner;
};

export type VerifyAndLoadImageArtifactOptions = {
  report?: (message: string) => void;
  run?: ImageArtifactCommandRunner;
};

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

const sha256 = async (path: string): Promise<string> => {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
};

const readManifest = async (
  directory: string,
): Promise<ValidatedImageManifest> => {
  const value: unknown = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8"),
  );
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Validated image manifest is not an object");
  }
  const manifest = value as ValidatedImageManifest;
  if (manifest.schemaVersion !== 1) {
    throw new Error(
      "Validated image manifest has an unsupported schema version",
    );
  }
  for (const target of releaseImageTargets) {
    const artifact = manifest.images?.[target];
    const capability = releaseImageCapability(target);
    if (
      artifact === undefined ||
      !/^sha256:[a-f0-9]{64}$/.test(artifact.imageId) ||
      artifact.identity?.command !== capability.command ||
      artifact.identity.description !== capability.description ||
      typeof artifact.identity.versionLabel !== "string" ||
      artifact.identity.versionLabel === ""
    ) {
      throw new Error(
        `Validated image manifest has an invalid ${target} entry`,
      );
    }
  }
  if (
    new Set(
      releaseImageTargets.map(
        (target) => manifest.images[target].identity.versionLabel,
      ),
    ).size !== 1
  ) {
    throw new Error(
      "Validated image manifest has inconsistent version labels across release targets",
    );
  }
  return manifest;
};

const readApplicationVersion = async (
  readApplicationManifest: () => Promise<{ version?: unknown }>,
): Promise<string> => {
  const version = (await readApplicationManifest()).version;
  if (typeof version !== "string") {
    throw new Error("Application package manifest has no release version");
  }
  return version;
};

const verifyChecksums = async (directory: string): Promise<void> => {
  const expected = new Map(
    (await readFile(join(directory, "SHA256SUMS"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => {
        const match = line.match(/^([a-f0-9]{64})\s+(.+)$/);
        if (match?.[1] === undefined || match[2] === undefined) {
          throw new Error("Validated image checksum file is malformed");
        }
        return [match[2], match[1]] as const;
      }),
  );
  for (const file of [
    "manifest.json",
    ...releaseImageTargets.map((target) => `${target}.tar`),
  ]) {
    const hash = expected.get(file);
    if (hash === undefined || hash !== (await sha256(join(directory, file)))) {
      throw new Error(`Validated image checksum does not match ${file}`);
    }
  }
};

export const verifyAndLoadImageArtifacts = async (
  directory: string,
  options: VerifyAndLoadImageArtifactOptions = {},
): Promise<ValidatedImageManifest> => {
  await verifyChecksums(directory);
  const manifest = await readManifest(directory);
  const run = options.run ?? defaultRun;
  const report =
    options.report ?? ((message: string) => process.stdout.write(message));
  for (const target of releaseImageTargets) {
    await run("docker", [
      "image",
      "load",
      "--input",
      join(directory, `${target}.tar`),
    ]);
    const artifact = manifest.images[target];
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
      version !== artifact.identity.versionLabel ||
      description !== artifact.identity.description ||
      command !== artifact.identity.command
    ) {
      throw new Error(`Loaded ${target} image does not match its manifest`);
    }
    report(
      `image-artifact target=${target} image=${imageId} verified-loaded\n`,
    );
  }
  return manifest;
};

export const publishImageArtifacts = async (
  directory: string,
  options: PublishImageArtifactOptions = {},
): Promise<void> => {
  const manifest = await readManifest(directory);
  const env = options.env ?? process.env;
  const image = env.IMAGE;
  const revision = env.GITHUB_SHA;
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
    const source = manifest.images[target].imageId;
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
  const [command, directory = "validated-images"] = process.argv.slice(2);
  if (command === "verify-and-load") {
    await verifyAndLoadImageArtifacts(directory);
  } else if (command === "publish") {
    await publishImageArtifacts(directory);
  } else {
    throw new Error(
      "Usage: image-artifacts.ts <verify-and-load|publish> [directory]",
    );
  }
}
