import {
  appendFile,
  mkdir,
  readdir,
  readFile as readFileFromDisk,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveCandidateIdentity } from "./candidate-identity.ts";
import { runApplicationLifecycle } from "./check-all-containers.ts";
import {
  publishImageArtifacts,
  verifyAndLoadImageArtifacts,
  verifyAndLoadImageFamilyArtifacts,
} from "./image-artifacts.ts";
import {
  imageBuildFamilyTargets,
  type ImageBuildFamily,
} from "./image-builder.ts";
import {
  candidateFamilyArtifactIdentity,
  cleanupCandidateImageArtifacts,
  combineCandidateImageFamilies,
  readCandidateImageFamilyManifest,
  type CandidateFamilyArtifactIdentity,
  type CandidateImageArtifactRoot,
  type CandidateImageManifest,
} from "./image-candidates.ts";
import {
  assertValidatedReleaseCandidates,
  createValidatedReleaseManifest,
  parseValidatedReleaseManifest,
  serializeValidatedReleaseManifest,
} from "./validated-release.ts";
import {
  executeVerificationNode,
  executeVerificationPlan,
} from "./verification-executor.ts";
import {
  createLocalVerificationNodeRegistry,
  type LocalCandidateRoundTrip,
} from "./verification-node-registry.ts";
import {
  aggregateVerificationRecords,
  createVerificationPlan,
  parseVerificationRecord,
  serializeVerificationPlan,
  serializeVerificationRecord,
  type VerificationRecord,
  type VerificationRunIdentity,
} from "./verification-plan.ts";
import {
  runVerificationCommand,
  type VerificationCommandRunner,
} from "./verification-runtime.ts";

type CiVerificationIo = {
  appendFile?: (path: string, value: string) => Promise<void>;
  cleanupCandidateArtifacts?: typeof cleanupCandidateImageArtifacts;
  env?: NodeJS.ProcessEnv;
  listDirectory: (path: string) => Promise<string[]>;
  makeDirectory?: (path: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  run?: VerificationCommandRunner;
  combineCandidateFamilies?: typeof combineCandidateImageFamilies;
  publishCandidates?: typeof publishImageArtifacts;
  verifyCandidateFamily?: typeof verifyAndLoadImageFamilyArtifacts;
  verifyCandidates?: typeof verifyAndLoadImageArtifacts;
  write: (value: string) => void;
  writeFile?: (path: string, value: string) => Promise<void>;
};

type OwnedCandidateArtifactRoot = CandidateImageArtifactRoot & {
  cleanup: () => Promise<void>;
};

type CandidateFamily = "application" | "spacy";
type CandidateImages = {
  applicationIdentity?: CandidateFamilyArtifactIdentity | undefined;
  runtimeImageId?: string | undefined;
  spacyImageId?: string | undefined;
  spacyIdentity?: CandidateFamilyArtifactIdentity | undefined;
  standaloneImageId?: string | undefined;
};

export const mergeCandidateImages = (
  families: readonly CandidateImages[],
): CandidateImages =>
  families.reduce<CandidateImages>(
    (images, family) => ({
      ...images,
      ...(family.applicationIdentity === undefined
        ? {}
        : { applicationIdentity: family.applicationIdentity }),
      ...(family.runtimeImageId === undefined
        ? {}
        : { runtimeImageId: family.runtimeImageId }),
      ...(family.spacyImageId === undefined
        ? {}
        : { spacyImageId: family.spacyImageId }),
      ...(family.spacyIdentity === undefined
        ? {}
        : { spacyIdentity: family.spacyIdentity }),
      ...(family.standaloneImageId === undefined
        ? {}
        : { standaloneImageId: family.standaloneImageId }),
    }),
    {},
  );

const familyArtifactIdentity = (
  manifest: CandidateImageManifest,
  family: ImageBuildFamily,
): CandidateFamilyArtifactIdentity =>
  candidateFamilyArtifactIdentity({
    candidates: Object.fromEntries(
      imageBuildFamilyTargets(family).map((target) => [
        target,
        manifest.candidates[target],
      ]),
    ),
    commitIdentity: manifest.commitIdentity,
    family,
    planIdentity: manifest.planIdentity,
    releaseIdentity: manifest.releaseIdentity,
    runIdentity: manifest.runIdentity,
    schemaVersion: 2,
  });

const workflowIdentityFrom = (
  env: NodeJS.ProcessEnv,
): VerificationRunIdentity | undefined => {
  const runId = env.GITHUB_RUN_ID;
  const sha = env.GITHUB_SHA;
  if (
    (runId === undefined || runId === "") &&
    (sha === undefined || sha === "")
  )
    return undefined;
  if (runId === undefined || runId === "" || sha === undefined || sha === "") {
    throw new Error(
      "CI verification requires both GITHUB_RUN_ID and GITHUB_SHA",
    );
  }
  return { runId, sha };
};

const parseRecords = (value: unknown): VerificationRecord[] =>
  Array.isArray(value)
    ? value.map(parseVerificationRecord)
    : [parseVerificationRecord(value)];

const assertUpstreamJobsSucceeded = (env: NodeJS.ProcessEnv): void => {
  const raw = env.CAT_VERIFICATION_JOB_RESULTS;
  if (raw === undefined || raw === "") {
    throw new Error("CAT_VERIFICATION_JOB_RESULTS is required");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("CI verification job results are malformed");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("CI verification job results are malformed");
  }
  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new Error("CI verification job results are empty");
  }
  for (const [job, result] of entries) {
    if (
      typeof result !== "object" ||
      result === null ||
      Array.isArray(result) ||
      Reflect.get(result, "result") !== "success"
    ) {
      throw new Error(`CI verification upstream job ${job} did not succeed`);
    }
  }
};

const isDirectoryError = (error: unknown): boolean =>
  Reflect.get(Object(error), "code") === "EISDIR";

const readRecordPath = async (
  path: string,
  io: CiVerificationIo,
): Promise<VerificationRecord[]> => {
  try {
    return parseRecords(JSON.parse(await io.readFile(path)) as unknown);
  } catch (error) {
    if (!isDirectoryError(error)) throw error;
  }
  const names = (await io.listDirectory(path))
    .filter((name) => name.endsWith(".json"))
    .sort();
  if (names.length === 0)
    throw new Error(
      "CI verification aggregate record directory has no JSON files",
    );
  return (
    await Promise.all(
      names.map(async (name) =>
        parseRecords(
          JSON.parse(await io.readFile(join(path, name))) as unknown,
        ),
      ),
    )
  ).flat();
};

const matricesFromPlan = (): Record<string, unknown> => {
  const plan = createVerificationPlan();
  return {
    digest: plan.digest,
    e2e: plan.nodes.flatMap((node) =>
      node.e2eTarget === "standalone" || node.e2eTarget === "runtime"
        ? [{ target: node.e2eTarget }]
        : [],
    ),
  };
};

const ciPlanJson = (): string => {
  const plan = createVerificationPlan();
  return (
    JSON.stringify({
      ...matricesFromPlan(),
      e2eTargets: plan.nodes.flatMap((node) =>
        node.e2eTarget === undefined
          ? []
          : [{ lane: node.lane, target: node.e2eTarget }],
      ),
      plan: JSON.parse(serializeVerificationPlan(plan)) as unknown,
      schemaVersion: 1,
    }) + "\n"
  );
};

const familyFor = (nodeId: string): CandidateFamily[] => {
  if (nodeId === "integration" || nodeId === "e2e-dev") return ["spacy"];
  if (
    nodeId === "e2e-standalone" ||
    nodeId === "e2e-runtime" ||
    nodeId === "container-lifecycle"
  )
    return ["application", "spacy"];
  return [];
};

const ownedCandidateArtifactRootFrom = (
  env: NodeJS.ProcessEnv,
  io: CiVerificationIo,
): OwnedCandidateArtifactRoot => {
  const directory = env.CAT_IMAGE_CANDIDATE_DIR;
  const ownerToken = env.CAT_IMAGE_CANDIDATE_OWNER_TOKEN;
  if (directory === undefined || directory === "") {
    throw new Error("CI verification candidate directory is required");
  }
  if (ownerToken === undefined || ownerToken === "") {
    throw new Error("CI verification candidate owner token is required");
  }
  let cleanupStarted = false;
  return {
    cleanup: async () => {
      if (cleanupStarted) return;
      cleanupStarted = true;
      await (io.cleanupCandidateArtifacts ?? cleanupCandidateImageArtifacts)(
        directory,
        ownerToken,
      );
    },
    directory,
    ownerToken,
  };
};

const candidateImagesFrom = async (
  family: CandidateFamily,
  artifactRoot: CandidateImageArtifactRoot,
  env: NodeJS.ProcessEnv,
  identity: VerificationRunIdentity,
  planDigest: string,
  run: VerificationCommandRunner,
  io: CiVerificationIo,
): Promise<CandidateImages> => {
  const expectedIdentity = resolveCandidateIdentity(env, {
    commitIdentity: identity.sha,
    planIdentity: planDigest,
    runIdentity: identity.runId,
  });
  if (
    expectedIdentity.commitIdentity !== identity.sha ||
    expectedIdentity.planIdentity !== planDigest ||
    expectedIdentity.runIdentity !== identity.runId
  ) {
    throw new Error(
      "CI verification candidate workflow identity does not match",
    );
  }
  const verify = io.verifyCandidateFamily ?? verifyAndLoadImageFamilyArtifacts;
  const manifest = await verify(artifactRoot.directory, family, {
    expectedIdentity,
    ownerToken: artifactRoot.ownerToken,
    run: async (command, args) =>
      (
        await run(command, args, {
          cwd: resolve(import.meta.dirname, ".."),
          env,
          stdio: "pipe",
        })
      ).stdout,
  });
  const imageId = (target: keyof CandidateImages): string | undefined => {
    const candidateTarget =
      target === "runtimeImageId"
        ? "runtime"
        : target === "standaloneImageId"
          ? "standalone"
          : "spacy";
    return manifest.candidates[candidateTarget]?.imageId;
  };
  return {
    ...(family === "application"
      ? { applicationIdentity: candidateFamilyArtifactIdentity(manifest) }
      : { spacyIdentity: candidateFamilyArtifactIdentity(manifest) }),
    runtimeImageId: imageId("runtimeImageId"),
    spacyImageId: imageId("spacyImageId"),
    standaloneImageId: imageId("standaloneImageId"),
  };
};

const ciCandidates = (
  env: NodeJS.ProcessEnv,
  loaded: CandidateImages,
  run: VerificationCommandRunner,
  cleanup: () => Promise<void> = async () => undefined,
): LocalCandidateRoundTrip => ({
  buildFamily: async (family, context) => {
    await run(
      "pnpm",
      [
        family === "application"
          ? "build:application-images"
          : "build:spacy-image",
      ],
      {
        cwd: resolve(import.meta.dirname, ".."),
        env,
        signal: context.signal,
        stdio: "inherit",
      },
    );
    const directory = env.CAT_IMAGE_CANDIDATE_DIR;
    const ownerToken = env.CAT_IMAGE_CANDIDATE_OWNER_TOKEN;
    if (directory === undefined || directory === "") {
      throw new Error("CI verification candidate directory is required");
    }
    if (ownerToken === undefined || ownerToken === "") {
      throw new Error("CI verification candidate owner token is required");
    }
    return candidateFamilyArtifactIdentity(
      await readCandidateImageFamilyManifest(directory, ownerToken, family),
    );
  },
  cleanup,
  ensureReleaseImages: async () => {
    if (
      loaded.runtimeImageId === undefined ||
      loaded.standaloneImageId === undefined
    )
      throw new Error("CI verification application candidates are unavailable");
    return {
      runtimeImageId: loaded.runtimeImageId,
      standaloneImageId: loaded.standaloneImageId,
    };
  },
  familyIdentity: (family) =>
    family === "application"
      ? loaded.applicationIdentity
      : loaded.spacyIdentity,
  prepareConsumer: (context) => context.onCleanup(cleanup),
  spacyImageId: () => loaded.spacyImageId,
});

const runCiNode = async (
  nodeId: string,
  io: CiVerificationIo,
): Promise<void> => {
  const env = io.env ?? process.env;
  const workflow = workflowIdentityFrom(env);
  if (workflow === undefined)
    throw new Error("CI verification node requires workflow identity");
  const recordPath = env.CAT_VERIFICATION_RECORD_PATH;
  if (recordPath === undefined || recordPath === "")
    throw new Error("CAT_VERIFICATION_RECORD_PATH is required");
  const plan = createVerificationPlan();
  const node = plan.nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined || !node.requiredRecord)
    throw new Error(`CI verification has no executable node ${nodeId}`);
  const run = io.run ?? runVerificationCommand;
  const families = familyFor(nodeId);
  const ownedCandidateRoot =
    families.length === 0 ? undefined : ownedCandidateArtifactRootFrom(env, io);
  const loadedFamilies: CandidateImages[] = [];
  let record: VerificationRecord | undefined;
  let validationError: unknown;
  try {
    for (const family of families) {
      if (ownedCandidateRoot === undefined) {
        throw new Error(`Verification node ${nodeId} has no candidate root`);
      }
      loadedFamilies.push(
        await candidateImagesFrom(
          family,
          ownedCandidateRoot,
          env,
          workflow,
          plan.digest,
          run,
          io,
        ),
      );
    }
    const loaded = mergeCandidateImages(loadedFamilies);
    const buildId = resolveCandidateIdentity(env, {
      commitIdentity: workflow.sha,
      planIdentity: plan.digest,
      runIdentity: workflow.runId,
    }).releaseIdentity;
    const { registry } = createLocalVerificationNodeRegistry({
      buildId,
      candidates: ciCandidates(env, loaded, run, ownedCandidateRoot?.cleanup),
      env,
      lifecycle: runApplicationLifecycle,
      planIdentity: plan.digest,
      projectName: `cat-verification-${workflow.runId}`,
      run,
      sourceSha: workflow.sha,
    });
    record = await executeVerificationNode(plan, nodeId, registry, {
      sourceSha: workflow.sha,
      workflow,
    });
  } catch (error) {
    validationError = error;
  } finally {
    try {
      await ownedCandidateRoot?.cleanup();
    } catch (cleanupError) {
      if (validationError !== undefined) {
        validationError = new AggregateError(
          [validationError, cleanupError],
          `Verification node ${nodeId} validation and candidate cleanup failed`,
        );
      } else {
        validationError = cleanupError;
      }
    }
  }
  if (validationError !== undefined) throw validationError;
  if (record === undefined) {
    throw new Error(`Verification node ${nodeId} produced no record`);
  }
  await (
    io.makeDirectory ?? (async (path) => await mkdir(path, { recursive: true }))
  )(dirname(recordPath));
  await (io.writeFile ?? (async (path, value) => await writeFile(path, value)))(
    recordPath,
    serializeVerificationRecord(record),
  );
  io.write(serializeVerificationRecord(record));
};

const runCiSourceLane = async (io: CiVerificationIo): Promise<void> => {
  const env = io.env ?? process.env;
  const workflow = workflowIdentityFrom(env);
  if (workflow === undefined) {
    throw new Error("CI verification source lane requires workflow identity");
  }
  const recordDirectory = env.CAT_VERIFICATION_RECORD_DIR;
  if (recordDirectory === undefined || recordDirectory === "") {
    throw new Error("CAT_VERIFICATION_RECORD_DIR is required");
  }
  const plan = createVerificationPlan();
  const nodeIds = plan.nodes
    .filter((node) => node.id.startsWith("source-") && node.requiredRecord)
    .map((node) => node.id);
  const run = io.run ?? runVerificationCommand;
  const buildId = resolveCandidateIdentity(env, {
    commitIdentity: workflow.sha,
    planIdentity: plan.digest,
    runIdentity: workflow.runId,
  }).releaseIdentity;
  const { registry } = createLocalVerificationNodeRegistry({
    buildId,
    candidates: ciCandidates(env, {}, run),
    env,
    lifecycle: runApplicationLifecycle,
    planIdentity: plan.digest,
    projectName: `cat-verification-${workflow.runId}`,
    run,
    sourceSha: workflow.sha,
  });
  const result = await executeVerificationPlan(plan, registry, {
    maxConcurrency: 2,
    nodeIds,
    sourceSha: workflow.sha,
    workflow,
  });
  await Promise.all(
    result.records.map(async (record) => {
      await writeTextFile(
        io,
        join(recordDirectory, `${record.nodeId}.json`),
        serializeVerificationRecord(record),
      );
    }),
  );
  io.write(
    JSON.stringify({ recordCount: result.records.length, status: "passed" }) +
      "\n",
  );
};

const candidateContextFrom = (
  env: NodeJS.ProcessEnv,
  workflow: VerificationRunIdentity,
  planDigest: string,
): {
  directory: string;
  expectedIdentity: ReturnType<typeof resolveCandidateIdentity>;
  ownerToken: string;
} => {
  const directory = env.CAT_IMAGE_CANDIDATE_DIR;
  const ownerToken = env.CAT_IMAGE_CANDIDATE_OWNER_TOKEN;
  if (directory === undefined || directory === "") {
    throw new Error("CAT_IMAGE_CANDIDATE_DIR is required");
  }
  if (ownerToken === undefined || ownerToken === "") {
    throw new Error("CAT_IMAGE_CANDIDATE_OWNER_TOKEN is required");
  }
  const expectedIdentity = resolveCandidateIdentity(env, {
    commitIdentity: workflow.sha,
    planIdentity: planDigest,
    runIdentity: workflow.runId,
  });
  if (
    expectedIdentity.commitIdentity !== workflow.sha ||
    expectedIdentity.planIdentity !== planDigest ||
    expectedIdentity.runIdentity !== workflow.runId
  ) {
    throw new Error(
      "CI verification candidate workflow identity does not match",
    );
  }
  return {
    directory,
    expectedIdentity,
    ownerToken,
  };
};

const verifyCombinedCandidates = async (
  io: CiVerificationIo,
  workflow: VerificationRunIdentity,
  planDigest: string,
) => {
  const env = io.env ?? process.env;
  const context = candidateContextFrom(env, workflow, planDigest);
  const combine = io.combineCandidateFamilies ?? combineCandidateImageFamilies;
  await combine(context.directory, context.ownerToken);
  const run = io.run ?? runVerificationCommand;
  const verify = io.verifyCandidates ?? verifyAndLoadImageArtifacts;
  const manifest = await verify(context.directory, {
    expectedIdentity: context.expectedIdentity,
    ownerToken: context.ownerToken,
    run: async (command, args) =>
      (
        await run(command, args, {
          cwd: resolve(import.meta.dirname, ".."),
          env,
          stdio: "pipe",
        })
      ).stdout,
  });
  return { context, manifest };
};

const writeTextFile = async (
  io: CiVerificationIo,
  path: string,
  value: string,
): Promise<void> => {
  await (
    io.makeDirectory ??
    (async (directory) => await mkdir(directory, { recursive: true }))
  )(dirname(path));
  await (io.writeFile ?? (async (file, text) => await writeFile(file, text)))(
    path,
    value,
  );
};

const aggregateCiVerification = async (
  paths: readonly string[],
  io: CiVerificationIo,
): Promise<void> => {
  const workflow = workflowIdentityFrom(io.env ?? process.env);
  if (workflow !== undefined) {
    assertUpstreamJobsSucceeded(io.env ?? process.env);
  }
  const records = (
    await Promise.all(paths.map(async (path) => await readRecordPath(path, io)))
  ).flat();
  const plan = createVerificationPlan();
  const verifiedCandidates =
    workflow === undefined
      ? undefined
      : await verifyCombinedCandidates(io, workflow, plan.digest);
  const aggregationOptions = (() => {
    if (workflow === undefined) return {};
    if (verifiedCandidates === undefined) {
      throw new Error("CI verification candidates were not verified");
    }
    return {
      artifactIdentities: {
        "application-candidates": familyArtifactIdentity(
          verifiedCandidates.manifest,
          "application",
        ),
        "spacy-candidate": familyArtifactIdentity(
          verifiedCandidates.manifest,
          "spacy",
        ),
      },
      runIdentity: workflow,
    };
  })();
  const result = aggregateVerificationRecords(
    plan,
    records,
    aggregationOptions,
  );
  if (workflow !== undefined) {
    const outputPath = (io.env ?? process.env)
      .CAT_VALIDATED_RELEASE_MANIFEST_PATH;
    if (outputPath === undefined || outputPath === "") {
      throw new Error("CAT_VALIDATED_RELEASE_MANIFEST_PATH is required");
    }
    if (verifiedCandidates === undefined) {
      throw new Error("CI verification candidates were not verified");
    }
    const validated = createValidatedReleaseManifest(
      verifiedCandidates.manifest,
      result.recordCount,
      workflow,
    );
    await writeTextFile(
      io,
      outputPath,
      serializeValidatedReleaseManifest(validated),
    );
  }
  io.write(JSON.stringify(result) + "\n");
};

const releaseValidatedCandidates = async (
  io: CiVerificationIo,
): Promise<void> => {
  const env = io.env ?? process.env;
  const workflow = workflowIdentityFrom(env);
  if (workflow === undefined) {
    throw new Error("CI verification release requires workflow identity");
  }
  const validatedPath = env.CAT_VALIDATED_RELEASE_MANIFEST_PATH;
  if (validatedPath === undefined || validatedPath === "") {
    throw new Error("CAT_VALIDATED_RELEASE_MANIFEST_PATH is required");
  }
  const plan = createVerificationPlan();
  const validated = parseValidatedReleaseManifest(
    JSON.parse(await io.readFile(validatedPath)) as unknown,
  );
  const expectedRecordCount = plan.nodes.filter(
    (node) => node.requiredRecord,
  ).length;
  if (validated.recordCount !== expectedRecordCount) {
    throw new Error("Validated release record count does not match");
  }
  const { context, manifest } = await verifyCombinedCandidates(
    io,
    workflow,
    plan.digest,
  );
  assertValidatedReleaseCandidates(
    validated,
    manifest,
    context.expectedIdentity,
  );
  const run = io.run ?? runVerificationCommand;
  const publish = io.publishCandidates ?? publishImageArtifacts;
  await publish(context.directory, {
    env,
    expectedIdentity: context.expectedIdentity,
    ownerToken: context.ownerToken,
    run: async (command, args) =>
      (
        await run(command, args, {
          cwd: resolve(import.meta.dirname, ".."),
          env,
          stdio: "pipe",
        })
      ).stdout,
  });
};

export const runCiVerificationCommand = async (
  args: readonly string[],
  io: CiVerificationIo,
): Promise<void> => {
  const [command, ...rest] = args;
  if (command === "plan" && rest.length === 0) {
    const output = ciPlanJson();
    io.write(output);
    const githubOutput = (io.env ?? process.env).GITHUB_OUTPUT;
    if (githubOutput !== undefined && githubOutput !== "") {
      const matrices = matricesFromPlan();
      const append =
        io.appendFile ?? (async (path, value) => await appendFile(path, value));
      await Promise.all(
        ["e2e"].map(
          async (name) =>
            await append(
              githubOutput,
              `${name}=${JSON.stringify(matrices[name])}\n`,
            ),
        ),
      );
    }
    return;
  }
  if (command === "run" && rest.length === 2 && rest[0] === "--lane") {
    if (rest[1] !== "source") {
      throw new Error(`CI verification has no executable lane ${rest[1]}`);
    }
    return await runCiSourceLane(io);
  }
  if (command === "run" && rest.length === 1)
    return await runCiNode(rest[0]!, io);
  if (command === "release" && rest.length === 0) {
    await releaseValidatedCandidates(io);
    return;
  }
  if (command !== "aggregate" || rest.length === 0)
    throw new Error(
      "Usage: ci-verification.ts <plan|run <node>|run --lane source|aggregate <record.json>...|release>",
    );
  await aggregateCiVerification(rest, io);
};

const directExecution =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (directExecution) {
  await runCiVerificationCommand(process.argv.slice(2), {
    appendFile: async (path, value) => {
      await appendFile(path, value);
    },
    env: process.env,
    listDirectory: async (path) => await readdir(path),
    makeDirectory: async (path) => {
      await mkdir(path, { recursive: true });
    },
    readFile: async (path) => await readFileFromDisk(path, "utf8"),
    write: (value) => process.stdout.write(value),
    writeFile: async (path, value) => {
      await writeFile(path, value);
    },
  });
}
