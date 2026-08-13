import {
  releaseImageTargets,
  type ReleaseImageTarget,
} from "./image-builder.ts";
import type {
  CandidateImageManifest,
  CandidateIdentity,
} from "./image-candidates.ts";
import type { VerificationRunIdentity } from "./verification-plan.ts";

export const validatedReleaseSchemaVersion = 1 as const;

export type ValidatedReleaseCandidate = {
  bundleSha256: string;
  imageId: string;
};

export type ValidatedReleaseManifest = CandidateIdentity & {
  candidates: Record<ReleaseImageTarget, ValidatedReleaseCandidate>;
  recordCount: number;
  schemaVersion: typeof validatedReleaseSchemaVersion;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean =>
  Object.keys(value).length === keys.length &&
  Object.keys(value).every((key) => keys.includes(key));

const parseCandidate = (value: unknown): ValidatedReleaseCandidate => {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["bundleSha256", "imageId"]) ||
    typeof value.bundleSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.bundleSha256) ||
    typeof value.imageId !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(value.imageId)
  ) {
    throw new Error("Validated release manifest has an invalid candidate");
  }
  return { bundleSha256: value.bundleSha256, imageId: value.imageId };
};

export const parseValidatedReleaseManifest = (
  value: unknown,
): ValidatedReleaseManifest => {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "candidates",
      "commitIdentity",
      "planIdentity",
      "recordCount",
      "releaseIdentity",
      "runIdentity",
      "schemaVersion",
    ]) ||
    value.schemaVersion !== validatedReleaseSchemaVersion ||
    !Number.isSafeInteger(value.recordCount) ||
    typeof value.recordCount !== "number" ||
    value.recordCount <= 0 ||
    typeof value.commitIdentity !== "string" ||
    value.commitIdentity === "" ||
    typeof value.planIdentity !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.planIdentity) ||
    typeof value.releaseIdentity !== "string" ||
    value.releaseIdentity === "" ||
    typeof value.runIdentity !== "string" ||
    value.runIdentity === "" ||
    !isRecord(value.candidates) ||
    !exactKeys(value.candidates, releaseImageTargets)
  ) {
    throw new Error("Validated release manifest has an unsupported schema");
  }
  return {
    candidates: {
      runtime: parseCandidate(value.candidates.runtime),
      spacy: parseCandidate(value.candidates.spacy),
      standalone: parseCandidate(value.candidates.standalone),
    },
    commitIdentity: value.commitIdentity,
    planIdentity: value.planIdentity,
    recordCount: value.recordCount,
    releaseIdentity: value.releaseIdentity,
    runIdentity: value.runIdentity,
    schemaVersion: validatedReleaseSchemaVersion,
  };
};

export const createValidatedReleaseManifest = (
  candidates: CandidateImageManifest,
  recordCount: number,
  workflow: VerificationRunIdentity,
): ValidatedReleaseManifest => {
  if (
    candidates.commitIdentity !== workflow.sha ||
    candidates.runIdentity !== workflow.runId
  ) {
    throw new Error(
      "Validated release candidate workflow identity does not match",
    );
  }
  return parseValidatedReleaseManifest({
    candidates: Object.fromEntries(
      releaseImageTargets.map((target) => [
        target,
        {
          bundleSha256: candidates.candidates[target].bundle.sha256,
          imageId: candidates.candidates[target].imageId,
        },
      ]),
    ),
    commitIdentity: candidates.commitIdentity,
    planIdentity: candidates.planIdentity,
    recordCount,
    releaseIdentity: candidates.releaseIdentity,
    runIdentity: candidates.runIdentity,
    schemaVersion: validatedReleaseSchemaVersion,
  });
};

export const assertValidatedReleaseCandidates = (
  validated: ValidatedReleaseManifest,
  candidates: CandidateImageManifest,
  expected: CandidateIdentity,
): void => {
  for (const [name, actual, wanted] of [
    ["commit", validated.commitIdentity, expected.commitIdentity],
    ["plan", validated.planIdentity, expected.planIdentity],
    ["release", validated.releaseIdentity, expected.releaseIdentity],
    ["run", validated.runIdentity, expected.runIdentity],
  ] as const) {
    if (actual !== wanted) {
      throw new Error(`Validated release ${name} identity does not match`);
    }
  }
  for (const target of releaseImageTargets) {
    const validatedCandidate = validated.candidates[target];
    const candidate = candidates.candidates[target];
    if (
      validatedCandidate.imageId !== candidate.imageId ||
      validatedCandidate.bundleSha256 !== candidate.bundle.sha256
    ) {
      throw new Error(`Validated release ${target} candidate does not match`);
    }
  }
};

export const serializeValidatedReleaseManifest = (
  manifest: ValidatedReleaseManifest,
): string => JSON.stringify(parseValidatedReleaseManifest(manifest)) + "\n";
