import { describe, expect, it, vi } from "vitest";

import type { TestServiceLease } from "../apps/app-e2e/test-service-lease.ts";
import type { CandidateFamilyArtifactIdentity } from "./image-candidates.ts";
import type { VerificationNodeContext } from "./verification-executor.ts";
import {
  createLocalVerificationNodeRegistry,
  type LocalCandidateRoundTrip,
  type VerificationCommandRunner,
} from "./verification-node-registry.ts";

const databaseUrl = "postgresql://cat:secret@172.17.0.1:5432/postgres";
const spacyImageId = `sha256:${"a".repeat(64)}`;
const spacyIdentity = "spacy-family" as CandidateFamilyArtifactIdentity;

vi.mock("../apps/app-e2e/test-service-lease.ts", () => ({
  runWithTestServiceLease: async (
    _options: unknown,
    consumer: (lease: TestServiceLease) => Promise<unknown>,
  ) =>
    await consumer({
      borrow: () => ({ release: async () => undefined }),
      coordinates: {
        databaseUrl,
        redisUrl: "redis://172.17.0.1:6379",
        spacyUrl: "http://172.17.0.1:8000",
      },
      databaseCleanup: "lease-volume",
      ownership: { projectName: "cat-test", token: "lease-token" },
      release: async () => undefined,
    }),
  serializeTestServiceLease: () => "serialized-lease",
}));

const context: VerificationNodeContext = {
  immutableInputs: { "source-sha": "source-sha" },
  node: {
    dependencies: ["spacy-image"],
    id: "integration",
    immutableInputs: ["source-sha"],
    lane: "integration",
    requiredArtifacts: ["spacy-candidate"],
    requiredRecord: true,
    resourceLane: "docker",
    timeoutClass: "long",
  },
  onCleanup: () => undefined,
  signal: new AbortController().signal,
};

const candidates: LocalCandidateRoundTrip = {
  buildFamily: async () => spacyIdentity,
  cleanup: async () => undefined,
  ensureReleaseImages: async () => ({
    runtimeImageId: `sha256:${"b".repeat(64)}`,
    standaloneImageId: `sha256:${"c".repeat(64)}`,
  }),
  familyIdentity: (family) => (family === "spacy" ? spacyIdentity : undefined),
  prepareConsumer: () => undefined,
  spacyImageId: () => spacyImageId,
};

const registryWith = (run: VerificationCommandRunner) =>
  createLocalVerificationNodeRegistry({
    buildId: "build-id",
    candidates,
    env: {},
    planIdentity: "plan-id",
    projectName: "cat-test",
    run,
    sourceSha: "source-sha",
  }).registry;

describe("verification node registry", () => {
  it("prepares the leased PostgreSQL database before integration tests", async () => {
    const calls: Array<{ args: string[]; databaseUrl: string | undefined }> =
      [];
    const registry = registryWith(async (command, args, options) => {
      expect(command).toBe("pnpm");
      calls.push({ args, databaseUrl: options.env.DATABASE_URL });
      return { stderr: "", stdout: "" };
    });

    await expect(registry.integration?.(context)).resolves.toBeDefined();

    expect(calls).toEqual([
      {
        args: ["--filter", "@cat/db", "drizzle:push"],
        databaseUrl,
      },
      { args: ["test:integration"], databaseUrl },
    ]);
  });

  it("does not start integration tests when database preparation fails", async () => {
    const calls: string[][] = [];
    const registry = registryWith(async (_command, args) => {
      calls.push(args);
      throw new Error("database preparation failed");
    });

    await expect(registry.integration?.(context)).rejects.toThrow(
      "database preparation failed",
    );
    expect(calls).toEqual([["--filter", "@cat/db", "drizzle:push"]]);
  });
});
