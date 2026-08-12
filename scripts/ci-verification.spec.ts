import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  mergeCandidateImages,
  runCiVerificationCommand,
} from "./ci-verification.ts";
import type { PublishImageArtifactOptions } from "./image-artifacts.ts";
import {
  imageBuildFamilyTargets,
  type ImageBuildFamily,
} from "./image-builder.ts";
import {
  candidateFamilyArtifactIdentity,
  type CandidateImageManifest,
} from "./image-candidates.ts";
import {
  createValidatedReleaseManifest,
  serializeValidatedReleaseManifest,
} from "./validated-release.ts";
import {
  createVerificationPlan,
  type VerificationRecord,
} from "./verification-plan.ts";

const sha = "1".repeat(40);
const runId = "run-123";
const releaseIdentity = `cat-validated-${sha}`;
const imageId = (digit: string): string => `sha256:${digit.repeat(64)}`;
const candidateManifest = (): CandidateImageManifest => {
  const applicationChecksum = "a".repeat(64);
  const spacyChecksum = "b".repeat(64);
  const planIdentity = createVerificationPlan().digest;
  return {
    candidates: {
      runtime: {
        bundle: {
          file: "application-images.tar",
          sha256: applicationChecksum,
        },
        capability: {
          command: "start-only",
          description: "CAT start-only application runtime",
        },
        imageId: imageId("2"),
        releaseIdentity,
        target: "runtime",
      },
      spacy: {
        bundle: { file: "spacy-image.tar", sha256: spacyChecksum },
        capability: {
          command: "provision-and-serve",
          description: "CAT spaCy language analysis runtime",
        },
        imageId: imageId("3"),
        releaseIdentity,
        target: "spacy",
      },
      standalone: {
        bundle: {
          file: "application-images.tar",
          sha256: applicationChecksum,
        },
        capability: {
          command: "prepare-and-start",
          description: "CAT standalone application with database preparation",
        },
        imageId: imageId("1"),
        releaseIdentity,
        target: "standalone",
      },
    },
    commitIdentity: sha,
    planIdentity,
    releaseIdentity,
    runIdentity: runId,
    schemaVersion: 2,
  };
};

const familyArtifactIdentity = (
  manifest: CandidateImageManifest,
  family: ImageBuildFamily,
): string =>
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

const completeRecords = (): VerificationRecord[] => {
  const plan = createVerificationPlan();
  const manifest = candidateManifest();
  const artifactIdentities = {
    "application-candidates": familyArtifactIdentity(manifest, "application"),
    "spacy-candidate": familyArtifactIdentity(manifest, "spacy"),
  };
  return plan.nodes
    .filter((node) => node.requiredRecord)
    .map((node) => ({
      artifacts: Object.fromEntries(
        node.requiredArtifacts.map((artifact) => [
          artifact,
          artifactIdentities[artifact as keyof typeof artifactIdentities],
        ]),
      ),
      cleanupCompleted: true,
      durationMs: 1,
      immutableInputs: { "source-sha": sha },
      lane: node.lane,
      nodeId: node.id,
      planDigest: plan.digest,
      schemaVersion: 1,
      workflow: { runId, sha },
    }));
};

describe("CI verification command", () => {
  it("receives a fixed node argument through the public pnpm script boundary", () => {
    const result = spawnSync("pnpm", ["ci:verification:run", "quality"], {
      cwd: resolve(import.meta.dirname, ".."),
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_RUN_ID: "",
        GITHUB_SHA: "",
      },
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(
      "CI verification node requires workflow identity",
    );
    expect(`${result.stdout}${result.stderr}`).not.toContain(
      "Usage: ci-verification.ts",
    );
  });

  it("merges independently transported candidate families without erasing IDs", () => {
    expect(
      mergeCandidateImages([
        {
          runtimeImageId: imageId("2"),
          standaloneImageId: imageId("1"),
        },
        { spacyImageId: imageId("3") },
      ]),
    ).toEqual({
      runtimeImageId: imageId("2"),
      spacyImageId: imageId("3"),
      standaloneImageId: imageId("1"),
    });
  });

  it("prints the typed plan JSON without starting a verification node", async () => {
    const output: string[] = [];

    await runCiVerificationCommand(["plan"], {
      listDirectory: async () => [],
      readFile: async () => {
        throw new Error("plan must not read records");
      },
      write: (value) => output.push(value),
    });

    const plan = JSON.parse(output.join("")) as {
      digest: string;
      e2eTargets: { lane: string; target: string }[];
    };
    expect(plan.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.e2eTargets).toEqual([
      { lane: "e2e-dev", target: "dev" },
      { lane: "e2e-standalone", target: "standalone" },
      { lane: "e2e-runtime", target: "runtime" },
    ]);
  });

  it("aggregates synthetic fixture records without running verification", async () => {
    const plan = createVerificationPlan();
    const records = plan.nodes
      .filter((node) => node.requiredRecord)
      .map((node) => ({
        artifacts: Object.fromEntries(
          node.requiredArtifacts.map((artifact) => [artifact, "candidate-a"]),
        ),
        cleanupCompleted: true,
        durationMs: 1,
        immutableInputs: { "source-sha": "abc123" },
        lane: node.lane,
        nodeId: node.id,
        planDigest: plan.digest,
        schemaVersion: 1,
      }));
    const output: string[] = [];

    await runCiVerificationCommand(["aggregate", "records.json"], {
      env: {},
      listDirectory: async () => [],
      readFile: async () => JSON.stringify(records),
      write: (value) => output.push(value),
    });

    expect(JSON.parse(output.join(""))).toEqual({
      planDigest: plan.digest,
      recordCount: records.length,
    });
  });

  it("reads a synthetic record directory without invoking verification", async () => {
    const plan = createVerificationPlan();
    const records = plan.nodes
      .filter((node) => node.requiredRecord)
      .map((node) => ({
        artifacts: Object.fromEntries(
          node.requiredArtifacts.map((artifact) => [artifact, "candidate-a"]),
        ),
        cleanupCompleted: true,
        durationMs: 1,
        immutableInputs: { "source-sha": "abc123" },
        lane: node.lane,
        nodeId: node.id,
        planDigest: plan.digest,
        schemaVersion: 1,
      }));
    const output: string[] = [];

    await runCiVerificationCommand(["aggregate", "records"], {
      env: {},
      listDirectory: async () => records.map((_, index) => `${index}.json`),
      readFile: async (path) => {
        if (path === "records") {
          const error = new Error("directory");
          Object.defineProperty(error, "code", { value: "EISDIR" });
          throw error;
        }
        const index = Number(path.match(/(\d+)\.json$/)?.[1]);
        return JSON.stringify(records[index]);
      },
      write: (value) => output.push(value),
    });

    expect(JSON.parse(output.join(""))).toMatchObject({
      planDigest: plan.digest,
      recordCount: records.length,
    });
  });

  it("writes a workflow-bound record only after the node and cleanup pass", async () => {
    const writes: Array<{ path: string; value: string }> = [];
    const run = vi.fn(async (command: string, args: string[]) => {
      expect([command, ...args]).toEqual(["pnpm", "check"]);
      return { stderr: "", stdout: "" };
    });

    await runCiVerificationCommand(["run", "quality"], {
      env: {
        CAT_CANDIDATE_RELEASE_IDENTITY: releaseIdentity,
        CAT_VERIFICATION_RECORD_PATH: "/tmp/records/quality.json",
        GITHUB_RUN_ID: runId,
        GITHUB_SHA: sha,
      },
      listDirectory: async () => [],
      readFile: async () => "",
      run,
      write: () => undefined,
      writeFile: async (path, value) => {
        writes.push({ path, value });
      },
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]!.value)).toMatchObject({
      cleanupCompleted: true,
      nodeId: "quality",
      workflow: { runId, sha },
    });
  });

  it("does not write a record when node validation fails", async () => {
    const writeFile = vi.fn(async () => undefined);

    await expect(
      runCiVerificationCommand(["run", "quality"], {
        env: {
          CAT_CANDIDATE_RELEASE_IDENTITY: releaseIdentity,
          CAT_VERIFICATION_RECORD_PATH: "/tmp/records/quality.json",
          GITHUB_RUN_ID: runId,
          GITHUB_SHA: sha,
        },
        listDirectory: async () => [],
        readFile: async () => "",
        run: async () => {
          throw new Error("quality failed");
        },
        write: () => undefined,
        writeFile,
      }),
    ).rejects.toThrow("quality failed");
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("preserves candidate validation and owned-root cleanup failures without writing a record", async () => {
    const writeFile = vi.fn(async () => undefined);
    const cleanupCandidateArtifacts = vi.fn(async () => {
      throw new Error("candidate cleanup failed");
    });

    let failure: unknown;
    try {
      await runCiVerificationCommand(["run", "integration"], {
        cleanupCandidateArtifacts,
        env: {
          CAT_CANDIDATE_RELEASE_IDENTITY: releaseIdentity,
          CAT_IMAGE_CANDIDATE_DIR: "/tmp/cat-candidates-run-123",
          CAT_IMAGE_CANDIDATE_OWNER_TOKEN: "owner",
          CAT_VERIFICATION_RECORD_PATH: "/tmp/records/integration.json",
          GITHUB_RUN_ID: runId,
          GITHUB_SHA: sha,
        },
        listDirectory: async () => [],
        readFile: async () => "",
        verifyCandidateFamily: async () => {
          throw new Error("candidate validation failed");
        },
        write: () => undefined,
        writeFile,
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: "candidate validation failed" }),
        expect.objectContaining({ message: "candidate cleanup failed" }),
      ]),
    );
    expect(cleanupCandidateArtifacts).toHaveBeenCalledOnce();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("runs the source lane as one dependency-aware workspace and writes every record", async () => {
    const writes: Array<{ path: string; value: string }> = [];
    const run = vi.fn(async (_command: string, _args: string[]) => ({
      stderr: "",
      stdout: "",
    }));

    await runCiVerificationCommand(["run", "--lane", "source"], {
      env: {
        CAT_CANDIDATE_RELEASE_IDENTITY: releaseIdentity,
        CAT_VERIFICATION_RECORD_DIR: "/tmp/records",
        GITHUB_RUN_ID: runId,
        GITHUB_SHA: sha,
      },
      listDirectory: async () => [],
      readFile: async () => "",
      run,
      write: () => undefined,
      writeFile: async (path, value) => {
        writes.push({ path, value });
      },
    });

    expect(writes).toHaveLength(7);
    expect(
      writes
        .map(({ value }) => Reflect.get(JSON.parse(value) as object, "nodeId"))
        .sort((left, right) => String(left).localeCompare(String(right))),
    ).toEqual(
      createVerificationPlan()
        .nodes.filter((node) => node.id.startsWith("source-"))
        .map((node) => node.id)
        .sort((left, right) => left.localeCompare(right)),
    );
    const commands = run.mock.calls.map(([, args]) => args[0]);
    expect(commands.indexOf("build:all")).toBeLessThan(
      commands.indexOf("test:artifacts:verify"),
    );
  });

  it("requires complete workflow identity and a record destination", async () => {
    const base = {
      listDirectory: async (): Promise<string[]> => [],
      readFile: async (): Promise<string> => "",
      write: (): void => undefined,
    };

    await expect(
      runCiVerificationCommand(["run", "quality"], {
        ...base,
        env: { GITHUB_RUN_ID: runId },
      }),
    ).rejects.toThrow("both GITHUB_RUN_ID and GITHUB_SHA");
    await expect(
      runCiVerificationCommand(["run", "quality"], {
        ...base,
        env: { GITHUB_RUN_ID: runId, GITHUB_SHA: sha },
      }),
    ).rejects.toThrow("CAT_VERIFICATION_RECORD_PATH");
  });

  it("aggregates records and emits a validated manifest for exact candidates", async () => {
    const records = completeRecords();
    const writes: Array<{ path: string; value: string }> = [];
    const combine = vi.fn(async () => candidateManifest());
    const verify = vi.fn(async () => candidateManifest());

    await runCiVerificationCommand(["aggregate", "records.json"], {
      combineCandidateFamilies: combine,
      env: {
        CAT_CANDIDATE_RELEASE_IDENTITY: releaseIdentity,
        CAT_IMAGE_CANDIDATE_DIR: "/tmp/cat-candidates-run-123",
        CAT_IMAGE_CANDIDATE_OWNER_TOKEN: "owner",
        CAT_VERIFICATION_JOB_RESULTS: JSON.stringify({
          quality: { result: "success" },
          source: { result: "success" },
        }),
        CAT_VALIDATED_RELEASE_MANIFEST_PATH: "/tmp/validated/release.json",
        GITHUB_RUN_ID: runId,
        GITHUB_SHA: sha,
      },
      listDirectory: async () => [],
      readFile: async () => JSON.stringify(records),
      verifyCandidates: verify,
      write: () => undefined,
      writeFile: async (path, value) => {
        writes.push({ path, value });
      },
    });

    expect(combine).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]!.value)).toMatchObject({
      candidates: {
        runtime: { imageId: imageId("2") },
        spacy: { imageId: imageId("3") },
        standalone: { imageId: imageId("1") },
      },
      recordCount: records.length,
      runIdentity: runId,
    });
  });

  it("rejects consumer records after a producer replaces a candidate family in the same run", async () => {
    const replacement = structuredClone(candidateManifest());
    replacement.candidates.runtime.imageId = imageId("4");
    replacement.candidates.standalone.imageId = imageId("5");
    replacement.candidates.runtime.bundle.sha256 = "c".repeat(64);
    replacement.candidates.standalone.bundle.sha256 = "c".repeat(64);

    await expect(
      runCiVerificationCommand(["aggregate", "records.json"], {
        combineCandidateFamilies: async () => replacement,
        env: {
          CAT_CANDIDATE_RELEASE_IDENTITY: releaseIdentity,
          CAT_IMAGE_CANDIDATE_DIR: "/tmp/cat-candidates-run-123",
          CAT_IMAGE_CANDIDATE_OWNER_TOKEN: "owner",
          CAT_VERIFICATION_JOB_RESULTS: JSON.stringify({
            quality: { result: "success" },
          }),
          CAT_VALIDATED_RELEASE_MANIFEST_PATH: "/tmp/validated/release.json",
          GITHUB_RUN_ID: runId,
          GITHUB_SHA: sha,
        },
        listDirectory: async () => [],
        readFile: async () => JSON.stringify(completeRecords()),
        verifyCandidates: async () => replacement,
        write: () => undefined,
      }),
    ).rejects.toThrow("mismatched artifact application-candidates");
  });

  it("rejects current failed or skipped jobs even when old records still exist", async () => {
    await expect(
      runCiVerificationCommand(["aggregate", "records.json"], {
        env: {
          CAT_CANDIDATE_RELEASE_IDENTITY: releaseIdentity,
          CAT_IMAGE_CANDIDATE_DIR: "/tmp/cat-candidates-run-123",
          CAT_IMAGE_CANDIDATE_OWNER_TOKEN: "owner",
          CAT_VERIFICATION_JOB_RESULTS: JSON.stringify({
            quality: { result: "failure" },
          }),
          CAT_VALIDATED_RELEASE_MANIFEST_PATH: "/tmp/validated/release.json",
          GITHUB_RUN_ID: runId,
          GITHUB_SHA: sha,
        },
        listDirectory: async () => [],
        readFile: async () => JSON.stringify(completeRecords()),
        write: () => undefined,
      }),
    ).rejects.toThrow("upstream job quality did not succeed");
  });

  it("rejects records whose candidate identity differs from the downloaded families", async () => {
    const records = completeRecords().map((record) => ({
      ...record,
      artifacts: Object.fromEntries(
        Object.keys(record.artifacts).map((artifact) => [
          artifact,
          "another-release",
        ]),
      ),
    }));

    await expect(
      runCiVerificationCommand(["aggregate", "records.json"], {
        combineCandidateFamilies: async () => candidateManifest(),
        env: {
          CAT_CANDIDATE_RELEASE_IDENTITY: releaseIdentity,
          CAT_IMAGE_CANDIDATE_DIR: "/tmp/cat-candidates-run-123",
          CAT_IMAGE_CANDIDATE_OWNER_TOKEN: "owner",
          CAT_VERIFICATION_JOB_RESULTS: JSON.stringify({
            quality: { result: "success" },
          }),
          CAT_VALIDATED_RELEASE_MANIFEST_PATH: "/tmp/validated/release.json",
          GITHUB_RUN_ID: runId,
          GITHUB_SHA: sha,
        },
        listDirectory: async () => [],
        readFile: async () => JSON.stringify(records),
        verifyCandidates: async () => candidateManifest(),
        write: () => undefined,
      }),
    ).rejects.toThrow("mismatched artifact");
  });

  it("publishes only candidates matched by the validated release manifest", async () => {
    const candidates = candidateManifest();
    const validated = createValidatedReleaseManifest(
      candidates,
      createVerificationPlan().nodes.filter((node) => node.requiredRecord)
        .length,
      { runId, sha },
    );
    const publish = vi.fn(
      async (_directory: string, _options: PublishImageArtifactOptions) =>
        undefined,
    );

    await runCiVerificationCommand(["release"], {
      combineCandidateFamilies: async () => candidates,
      env: {
        CAT_CANDIDATE_RELEASE_IDENTITY: releaseIdentity,
        CAT_IMAGE_CANDIDATE_DIR: "/tmp/cat-candidates-run-123",
        CAT_IMAGE_CANDIDATE_OWNER_TOKEN: "owner",
        CAT_VALIDATED_RELEASE_MANIFEST_PATH: "/tmp/validated/release.json",
        GITHUB_RUN_ID: runId,
        GITHUB_SHA: sha,
      },
      listDirectory: async () => [],
      publishCandidates: publish,
      readFile: async () => serializeValidatedReleaseManifest(validated),
      verifyCandidates: async () => candidates,
      write: () => undefined,
    });

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]?.[1]).toMatchObject({
      expectedIdentity: {
        commitIdentity: sha,
        planIdentity: candidates.planIdentity,
        releaseIdentity,
        runIdentity: runId,
      },
    });
  });
});
