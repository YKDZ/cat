import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import {
  runWithTestServiceLease,
  serializeTestServiceLease,
} from "../apps/app-e2e/test-service-lease.ts";
import { resolveCandidateIdentity } from "./candidate-identity.ts";
import { verifyAndLoadImageArtifacts } from "./image-artifacts.ts";
import {
  buildReleaseImages,
  type ImageBuildCommandRunner,
  type ImageBuildFamily,
  type ReleaseImageBuildResult,
} from "./image-builder.ts";
import {
  candidateFamilyArtifactIdentity,
  cleanupCandidateImageArtifacts,
  combineCandidateImageFamilies,
  createCandidateImageArtifactRoot,
  writeCandidateImageFamily,
  type CandidateFamilyArtifactIdentity,
} from "./image-candidates.ts";
import type {
  VerificationNodeContext,
  VerificationNodeRegistry,
} from "./verification-executor.ts";
import type { ApplicationLifecycleContext } from "./verification-runtime.ts";

export type VerificationCommandResult = { stderr: string; stdout: string };

export type VerificationCommandRunner = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    signal?: AbortSignal;
    stdio?: "inherit" | "pipe";
  },
) => Promise<VerificationCommandResult>;

type LocalCandidateState = {
  application?: ReleaseImageBuildResult;
  applicationIdentity?: CandidateFamilyArtifactIdentity;
  directory?: string;
  ownerToken: string;
  roundTripCompleted: boolean;
  runIdentity: string;
  spacy?: ReleaseImageBuildResult;
  spacyIdentity?: CandidateFamilyArtifactIdentity;
};

export type LocalCandidateRoundTrip = {
  buildFamily: (
    family: ImageBuildFamily,
    context: VerificationNodeContext,
  ) => Promise<CandidateFamilyArtifactIdentity>;
  cleanup: () => Promise<void>;
  ensureReleaseImages: (context: VerificationNodeContext) => Promise<{
    runtimeImageId: string;
    standaloneImageId: string;
  }>;
  familyIdentity: (
    family: ImageBuildFamily,
  ) => CandidateFamilyArtifactIdentity | undefined;
  prepareConsumer: (context: VerificationNodeContext) => void;
  spacyImageId: () => string | undefined;
};

export type VerificationLifecycleContext = ApplicationLifecycleContext;

export type LocalVerificationNodeRegistryOptions = {
  buildId: string;
  candidates?: LocalCandidateRoundTrip;
  env: NodeJS.ProcessEnv;
  lifecycle?: (
    context: VerificationLifecycleContext,
    images: ReleaseImageBuildResult,
  ) => Promise<unknown>;
  planIdentity: string;
  projectName: string;
  report?: (message: string) => void;
  reportError?: (message: string) => void;
  run: VerificationCommandRunner;
  sourceSha: string;
  workspaceRoot?: string;
};

const root = resolve(import.meta.dirname, "..");

const imageFor = (
  result: ReleaseImageBuildResult | undefined,
  target: "runtime" | "spacy" | "standalone",
): string | undefined =>
  result?.images.find((image) => image.target === target)?.imageId;

const defaultCandidateRoundTrip = (
  options: Pick<
    LocalVerificationNodeRegistryOptions,
    | "buildId"
    | "env"
    | "planIdentity"
    | "projectName"
    | "report"
    | "reportError"
    | "run"
    | "sourceSha"
  >,
): LocalCandidateRoundTrip => {
  const state: LocalCandidateState = {
    ownerToken: options.env.CAT_IMAGE_CANDIDATE_OWNER_TOKEN ?? randomUUID(),
    roundTripCompleted: false,
    runIdentity:
      options.env.CAT_CANDIDATE_RUN_ID ??
      options.env.GITHUB_RUN_ID ??
      `local-${randomUUID()}`,
  };
  const directory = async (): Promise<string> => {
    if (state.directory === undefined) {
      state.directory = (
        await createCandidateImageArtifactRoot(state.ownerToken)
      ).directory;
    }
    return state.directory;
  };
  const imageRunner: ImageBuildCommandRunner = async (command, args, context) =>
    await options.run(command, args, context);
  const buildFamily = async (
    family: ImageBuildFamily,
    context: VerificationNodeContext,
  ): Promise<CandidateFamilyArtifactIdentity> => {
    const images = await buildReleaseImages({
      buildId: options.buildId,
      cwd: root,
      env: options.env,
      ...(options.report === undefined ? {} : { report: options.report }),
      ...(options.reportError === undefined
        ? {}
        : { reportError: options.reportError }),
      run: imageRunner,
      signal: context.signal,
      targets: family === "application" ? ["standalone", "runtime"] : ["spacy"],
    });
    if (family === "application") state.application = images;
    else state.spacy = images;
    const manifest = await writeCandidateImageFamily({
      directory: await directory(),
      family,
      identity: resolveCandidateIdentity(
        {},
        {
          commitIdentity: context.immutableInputs["source-sha"]!,
          planIdentity: options.planIdentity,
          releaseIdentity: options.buildId,
          runIdentity: state.runIdentity,
        },
      ),
      images,
      ownerToken: state.ownerToken,
      run: async (args) =>
        (
          await options.run("docker", args, {
            cwd: root,
            env: options.env,
            signal: context.signal,
            stdio: "pipe",
          })
        ).stdout,
    });
    const artifactIdentity = candidateFamilyArtifactIdentity(manifest);
    if (family === "application") state.applicationIdentity = artifactIdentity;
    else state.spacyIdentity = artifactIdentity;
    return artifactIdentity;
  };
  return {
    buildFamily,
    cleanup: async () => {
      if (state.directory !== undefined) {
        await cleanupCandidateImageArtifacts(state.directory, state.ownerToken);
      }
    },
    ensureReleaseImages: async (context) => {
      if (state.application === undefined || state.spacy === undefined) {
        throw new Error(
          "Release verification requires both candidate image families",
        );
      }
      if (!state.roundTripCompleted) {
        await combineCandidateImageFamilies(
          await directory(),
          state.ownerToken,
        );
        await verifyAndLoadImageArtifacts(await directory(), {
          expectedIdentity: {
            commitIdentity: options.sourceSha,
            planIdentity: options.planIdentity,
            releaseIdentity: options.buildId,
            runIdentity: state.runIdentity,
          },
          ownerToken: state.ownerToken,
          run: async (command, args) =>
            (
              await options.run(command, args, {
                cwd: root,
                env: options.env,
                signal: context.signal,
                stdio: "pipe",
              })
            ).stdout,
        });
        state.roundTripCompleted = true;
      }
      const runtimeImageId = imageFor(state.application, "runtime");
      const standaloneImageId = imageFor(state.application, "standalone");
      if (runtimeImageId === undefined || standaloneImageId === undefined) {
        throw new Error("Application candidate family is incomplete");
      }
      return { runtimeImageId, standaloneImageId };
    },
    familyIdentity: (family) =>
      family === "application"
        ? state.applicationIdentity
        : state.spacyIdentity,
    prepareConsumer: () => undefined,
    spacyImageId: () => imageFor(state.spacy, "spacy"),
  };
};

const requiredFamilyIdentity = (
  candidates: LocalCandidateRoundTrip,
  family: ImageBuildFamily,
): CandidateFamilyArtifactIdentity => {
  const identity = candidates.familyIdentity(family);
  if (identity === undefined) {
    throw new Error(`Candidate ${family} family identity is unavailable`);
  }
  return identity;
};

const runScript = async (
  options: LocalVerificationNodeRegistryOptions,
  context: VerificationNodeContext,
  args: string[],
  environment: NodeJS.ProcessEnv = options.env,
): Promise<void> => {
  await options.run("pnpm", args, {
    cwd: options.workspaceRoot ?? root,
    env: environment,
    signal: context.signal,
    stdio: "inherit",
  });
};

const runWithServices = async (
  options: LocalVerificationNodeRegistryOptions,
  context: VerificationNodeContext,
  candidates: LocalCandidateRoundTrip,
  execute: (environment: NodeJS.ProcessEnv) => Promise<void>,
): Promise<void> => {
  const spacyImageId = candidates.spacyImageId();
  if (spacyImageId === undefined)
    throw new Error("spaCy candidate is unavailable");
  await runWithTestServiceLease(
    {
      environment: { ...options.env, CAT_SPACY_IMAGE_ID: spacyImageId },
      run: async (command, args, commandOptions) =>
        await options.run(command, args, commandOptions),
      signal: context.signal,
    },
    async (lease) => {
      await execute({
        ...options.env,
        CAT_SPACY_IMAGE_ID: spacyImageId,
        CAT_TEST_SERVICE_LEASE: serializeTestServiceLease(lease),
        DATABASE_URL: lease.coordinates.databaseUrl,
        REDIS_URL: lease.coordinates.redisUrl,
        SPACY_SERVER_URL: lease.coordinates.spacyUrl,
        TEST_DATABASE_URL: lease.coordinates.databaseUrl,
      });
    },
  );
};

export const createLocalVerificationNodeRegistry = (
  options: LocalVerificationNodeRegistryOptions,
): {
  candidates: LocalCandidateRoundTrip;
  registry: VerificationNodeRegistry;
} => {
  const candidates = options.candidates ?? defaultCandidateRoundTrip(options);
  const registry: VerificationNodeRegistry = {
    quality: async (context) => await runScript(options, context, ["check"]),
    "source-base-image": async (context) =>
      await runScript(options, context, ["container:verify-base-image"]),
    "source-compose-contract": async (context) =>
      await runScript(options, context, ["test:compose-contract"]),
    "source-pglite": async (context) =>
      await runScript(options, context, ["test:pglite"]),
    "source-dockerfile": async (context) =>
      await runScript(options, context, ["container:check-dockerfile"]),
    "source-application-build": async (context) =>
      await runScript(options, context, ["build:all"]),
    "source-package-artifacts": async (context) =>
      await runScript(options, context, ["test:artifacts:verify"]),
    "source-image-artifact-contract": async (context) =>
      await runScript(options, context, ["test:image-artifact-contract"]),
    "spacy-image": async (context) => ({
      artifacts: {
        "spacy-candidate": await candidates.buildFamily("spacy", context),
      },
    }),
    "application-images": async (context) => ({
      artifacts: {
        "application-candidates": await candidates.buildFamily(
          "application",
          context,
        ),
      },
    }),
    integration: async (context) => {
      candidates.prepareConsumer(context);
      await runWithServices(
        options,
        context,
        candidates,
        async (environment) => {
          await runScript(
            options,
            context,
            ["--filter", "@cat/db", "drizzle:push"],
            environment,
          );
          await runScript(options, context, ["test:integration"], environment);
        },
      );
      return {
        artifacts: {
          "spacy-candidate": requiredFamilyIdentity(candidates, "spacy"),
        },
      };
    },
    "e2e-dev": async (context) => {
      candidates.prepareConsumer(context);
      await runWithServices(
        options,
        context,
        candidates,
        async (environment) =>
          await runScript(
            options,
            context,
            ["test:e2e", "--", "--target", "dev", "--concurrency", "2"],
            environment,
          ),
      );
      return {
        artifacts: {
          "spacy-candidate": requiredFamilyIdentity(candidates, "spacy"),
        },
      };
    },
    "e2e-standalone": async (context) => {
      candidates.prepareConsumer(context);
      const images = await candidates.ensureReleaseImages(context);
      await runWithServices(
        options,
        context,
        candidates,
        async (environment) =>
          await runScript(
            options,
            context,
            ["test:e2e", "--", "--target", "standalone", "--concurrency", "2"],
            {
              ...environment,
              CAT_E2E_STANDALONE_IMAGE_ID: images.standaloneImageId,
            },
          ),
      );
      return {
        artifacts: {
          "application-candidates": requiredFamilyIdentity(
            candidates,
            "application",
          ),
          "spacy-candidate": requiredFamilyIdentity(candidates, "spacy"),
        },
      };
    },
    "e2e-runtime": async (context) => {
      candidates.prepareConsumer(context);
      const images = await candidates.ensureReleaseImages(context);
      await runWithServices(
        options,
        context,
        candidates,
        async (environment) =>
          await runScript(
            options,
            context,
            ["test:e2e", "--", "--target", "runtime", "--concurrency", "2"],
            {
              ...environment,
              CAT_E2E_RUNTIME_IMAGE_ID: images.runtimeImageId,
              CAT_E2E_STANDALONE_IMAGE_ID: images.standaloneImageId,
            },
          ),
      );
      return {
        artifacts: {
          "application-candidates": requiredFamilyIdentity(
            candidates,
            "application",
          ),
          "spacy-candidate": requiredFamilyIdentity(candidates, "spacy"),
        },
      };
    },
    "container-lifecycle": async (context) => {
      candidates.prepareConsumer(context);
      const images = await candidates.ensureReleaseImages(context);
      if (options.lifecycle === undefined) {
        throw new Error("Container lifecycle implementation is unavailable");
      }
      const spacyImageId = candidates.spacyImageId();
      if (spacyImageId === undefined)
        throw new Error("spaCy candidate is unavailable");
      await runWithServices(
        options,
        context,
        candidates,
        async (environment) => {
          await options.lifecycle!(
            {
              buildId: options.buildId,
              env: environment,
              projectName: options.projectName,
              ...(options.report === undefined
                ? {}
                : { report: options.report }),
              ...(options.reportError === undefined
                ? {}
                : { reportError: options.reportError }),
              run: options.run,
              signal: context.signal,
            },
            {
              images: [
                { imageId: images.standaloneImageId, target: "standalone" },
                { imageId: images.runtimeImageId, target: "runtime" },
                { imageId: spacyImageId, target: "spacy" },
              ],
            },
          );
        },
      );
      return {
        artifacts: {
          "application-candidates": requiredFamilyIdentity(
            candidates,
            "application",
          ),
          "spacy-candidate": requiredFamilyIdentity(candidates, "spacy"),
        },
      };
    },
  };
  return { candidates, registry };
};
