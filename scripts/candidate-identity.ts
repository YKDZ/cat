import type { CandidateIdentity } from "./image-candidates.ts";

type CandidateIdentityDefaults = {
  commitIdentity?: string;
  planIdentity: string;
  releaseIdentity?: string;
  runIdentity?: string;
};

const nonEmpty = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== "";

export const resolveCandidateIdentity = (
  env: NodeJS.ProcessEnv,
  defaults: CandidateIdentityDefaults,
): CandidateIdentity => {
  const runIdentity =
    env.CAT_CANDIDATE_RUN_ID ?? env.GITHUB_RUN_ID ?? defaults.runIdentity;
  if (!nonEmpty(runIdentity)) {
    throw new Error("Candidate run identity is required");
  }
  const commitIdentity =
    env.CAT_CANDIDATE_COMMIT_IDENTITY ??
    env.GITHUB_SHA ??
    defaults.commitIdentity ??
    `local-${runIdentity}`;
  const planIdentity = env.CAT_CANDIDATE_PLAN_ID ?? defaults.planIdentity;
  const releaseIdentity =
    env.CAT_CANDIDATE_RELEASE_IDENTITY ??
    env.DEPLOYMENT_BUILD_ID ??
    defaults.releaseIdentity ??
    `cat-validated-${commitIdentity}`;
  if (
    !nonEmpty(commitIdentity) ||
    !nonEmpty(planIdentity) ||
    !nonEmpty(releaseIdentity)
  ) {
    throw new Error(
      "Candidate verification requires commit, plan, release, and run identities",
    );
  }
  if (
    nonEmpty(env.DEPLOYMENT_BUILD_ID) &&
    env.DEPLOYMENT_BUILD_ID !== releaseIdentity
  ) {
    throw new Error(
      "DEPLOYMENT_BUILD_ID does not match the candidate release identity",
    );
  }
  return { commitIdentity, planIdentity, releaseIdentity, runIdentity };
};
