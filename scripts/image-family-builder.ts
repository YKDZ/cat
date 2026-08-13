import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveCandidateIdentity } from "./candidate-identity.ts";
import {
  buildReleaseImages,
  imageBuildFamilyTargets,
  parseImageBuildArguments,
  type ImageBuildCommandRunner,
  type ImageBuildFamily,
} from "./image-builder.ts";
import {
  cleanupCandidateImageArtifacts,
  combineCandidateImageFamilies,
  createCandidateImageArtifactRoot,
  writeCandidateImageFamily,
} from "./image-candidates.ts";
import { createVerificationPlan } from "./verification-plan.ts";

const root = resolve(import.meta.dirname, "..");

const familyFromArguments = (args: string[]): ImageBuildFamily => {
  const targets = parseImageBuildArguments(args);
  return targets.length === 1 && targets[0] === "spacy"
    ? "spacy"
    : "application";
};

const run: ImageBuildCommandRunner = async (command, args, options) =>
  await new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      signal: options.signal,
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
      if (code === 0) resolveResult({ stderr, stdout });
      else reject(new Error(`${command} ${args.join(" ")} failed: ${stderr}`));
    });
  });

export const buildCandidateImageFamily = async (
  family: ImageBuildFamily,
  env: NodeJS.ProcessEnv = process.env,
  commandRunner: ImageBuildCommandRunner = run,
): Promise<string> => {
  const directory = env.CAT_IMAGE_CANDIDATE_DIR;
  const ownerToken = env.CAT_IMAGE_CANDIDATE_OWNER_TOKEN;
  if (
    directory === undefined ||
    directory === "" ||
    ownerToken === undefined ||
    ownerToken === ""
  ) {
    throw new Error(
      "CAT_IMAGE_CANDIDATE_DIR and CAT_IMAGE_CANDIDATE_OWNER_TOKEN are required",
    );
  }
  const identity = resolveCandidateIdentity(env, {
    planIdentity: createVerificationPlan().digest,
  });
  try {
    const images = await buildReleaseImages({
      buildId: identity.releaseIdentity,
      cwd: root,
      env,
      report: (message) => process.stdout.write(message),
      reportError: (message) => process.stderr.write(message),
      run: commandRunner,
      signal: new AbortController().signal,
      targets: imageBuildFamilyTargets(family),
    });
    await writeCandidateImageFamily({
      directory,
      family,
      identity,
      images,
      ownerToken,
      run: async (args) =>
        (
          await commandRunner("docker", args, {
            cwd: root,
            env,
            signal: new AbortController().signal,
            stdio: "pipe",
          })
        ).stdout,
    });
    process.stdout.write(
      `candidate-family family=${family} directory=${directory} commit=${identity.commitIdentity} plan=${identity.planIdentity} release=${identity.releaseIdentity} run=${identity.runIdentity}\n`,
    );
    return directory;
  } catch (error) {
    await cleanupCandidateImageArtifacts(directory, ownerToken).catch(
      () => undefined,
    );
    throw error;
  }
};

export const buildAllCandidateImages = async (
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> => {
  const invocation = randomUUID();
  const runIdentity = env.CAT_CANDIDATE_RUN_ID ?? `local-${invocation}`;
  const ownerToken = env.CAT_IMAGE_CANDIDATE_OWNER_TOKEN ?? randomUUID();
  const { directory } = await createCandidateImageArtifactRoot(ownerToken);
  const sharedEnv: NodeJS.ProcessEnv = {
    ...env,
    CAT_CANDIDATE_RUN_ID: runIdentity,
    CAT_IMAGE_CANDIDATE_DIR: directory,
    CAT_IMAGE_CANDIDATE_OWNER_TOKEN: ownerToken,
  };
  try {
    await buildCandidateImageFamily("application", sharedEnv);
    await buildCandidateImageFamily("spacy", sharedEnv);
    await combineCandidateImageFamilies(directory, ownerToken);
    const identity = resolveCandidateIdentity(sharedEnv, {
      planIdentity: createVerificationPlan().digest,
    });
    process.stdout.write(
      `candidate-images directory=${directory} owner-token=${ownerToken} commit=${identity.commitIdentity} plan=${identity.planIdentity} release=${identity.releaseIdentity} run=${identity.runIdentity}\n`,
    );
    return directory;
  } catch (error) {
    await cleanupCandidateImageArtifacts(directory, ownerToken).catch(
      () => undefined,
    );
    throw error;
  }
};

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--all") {
    await buildAllCandidateImages();
  } else {
    await buildCandidateImageFamily(familyFromArguments(args));
  }
}
