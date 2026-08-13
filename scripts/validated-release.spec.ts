import { describe, expect, it } from "vitest";

import type { CandidateImageManifest } from "./image-candidates.ts";
import {
  assertValidatedReleaseCandidates,
  createValidatedReleaseManifest,
  parseValidatedReleaseManifest,
  serializeValidatedReleaseManifest,
} from "./validated-release.ts";

const image = (digit: string): string => `sha256:${digit.repeat(64)}`;
const bundle = (digit: string): string => digit.repeat(64);
const candidates: CandidateImageManifest = {
  candidates: {
    runtime: {
      bundle: { file: "application-images.tar", sha256: bundle("a") },
      capability: {
        command: "start-only",
        description: "CAT start-only application runtime",
      },
      imageId: image("2"),
      releaseIdentity: "release-1",
      target: "runtime",
    },
    spacy: {
      bundle: { file: "spacy-image.tar", sha256: bundle("b") },
      capability: {
        command: "provision-and-serve",
        description: "CAT spaCy language analysis runtime",
      },
      imageId: image("3"),
      releaseIdentity: "release-1",
      target: "spacy",
    },
    standalone: {
      bundle: { file: "application-images.tar", sha256: bundle("a") },
      capability: {
        command: "prepare-and-start",
        description: "CAT standalone application with database preparation",
      },
      imageId: image("1"),
      releaseIdentity: "release-1",
      target: "standalone",
    },
  },
  commitIdentity: "commit-1",
  planIdentity: "c".repeat(64),
  releaseIdentity: "release-1",
  runIdentity: "run-1",
  schemaVersion: 2,
};

describe("validated release manifest", () => {
  it("binds aggregate success to exact immutable candidate IDs and bundles", () => {
    const manifest = createValidatedReleaseManifest(candidates, 14, {
      runId: "run-1",
      sha: "commit-1",
    });

    expect(JSON.parse(serializeValidatedReleaseManifest(manifest))).toEqual(
      manifest,
    );
    expect(() =>
      assertValidatedReleaseCandidates(manifest, candidates, {
        commitIdentity: "commit-1",
        planIdentity: "c".repeat(64),
        releaseIdentity: "release-1",
        runIdentity: "run-1",
      }),
    ).not.toThrow();
  });

  it("rejects altered candidate identity and unallowlisted fields", () => {
    const manifest = createValidatedReleaseManifest(candidates, 14, {
      runId: "run-1",
      sha: "commit-1",
    });

    expect(() =>
      assertValidatedReleaseCandidates(
        manifest,
        {
          ...candidates,
          candidates: {
            ...candidates.candidates,
            runtime: {
              ...candidates.candidates.runtime,
              imageId: image("4"),
            },
          },
        },
        {
          commitIdentity: "commit-1",
          planIdentity: "c".repeat(64),
          releaseIdentity: "release-1",
          runIdentity: "run-1",
        },
      ),
    ).toThrow("runtime candidate");
    expect(() =>
      parseValidatedReleaseManifest({ ...manifest, unexpected: "field" }),
    ).toThrow("unsupported schema");
  });
});
