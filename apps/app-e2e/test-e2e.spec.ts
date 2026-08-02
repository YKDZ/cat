import { spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertRuntimeImagePair,
  cellsForSelection,
  formatE2EDiagnostic,
  parseE2ECommand,
  parseE2ESelection,
  writeE2eAttestation,
  type E2ESelection,
} from "./test-e2e.ts";

const lease = {} as Parameters<typeof cellsForSelection>[1];
const standaloneImageId = `sha256:${"a".repeat(64)}`;
const runtimeImageId = `sha256:${"b".repeat(64)}`;

const runDirectE2E = async (
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stderr: string; stdout: string }> => {
  const child = spawn(
    process.execPath,
    ["--conditions=source", "test-e2e.ts", "--target", "dev"],
    {
      cwd: import.meta.dirname,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
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
  const [code] = await once(child, "close");
  return { code: code as number | null, stderr, stdout };
};

const serializedLease = (redisUrl: string): string =>
  JSON.stringify({
    coordinates: {
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5432/cat",
      redisUrl,
      spacyUrl: "http://127.0.0.1:8000",
    },
    ownership: { projectName: "cat-e2e-redaction", token: "lease-token" },
    version: 1,
  });

describe("release E2E selection", () => {
  it("redacts credentials from the direct-command diagnostic without hiding the safe stack", () => {
    const error = new Error(
      "request failed for https://operator:password@example.test/auth?token=secret-token",
    );
    error.stack = `Error: ${error.message}\n    at safeFrame (/app/test-e2e.ts:1:1)\n    sessionId=session-secret csrfToken=csrf-secret`;

    const diagnostic = formatE2EDiagnostic(error);

    expect(diagnostic).toContain("Error: request failed");
    expect(diagnostic).toContain("at safeFrame (/app/test-e2e.ts:1:1)");
    expect(diagnostic).toContain("https://[REDACTED]@example.test/auth");
    expect(diagnostic).toContain("token=[REDACTED]");
    expect(diagnostic).toContain("sessionId=[REDACTED]");
    expect(diagnostic).toContain("csrfToken=[REDACTED]");
    expect(diagnostic).not.toContain("operator");
    expect(diagnostic).not.toContain("password");
    expect(diagnostic).not.toContain("secret-token");
    expect(diagnostic).not.toContain("session-secret");
    expect(diagnostic).not.toContain("csrf-secret");
  });

  it("redacts a password-only Redis URL from a direct CLI child failure", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cat-e2e-cli-redaction-"));
    const docker = join(directory, "docker");
    const redisUrl = "redis://:redis-password@127.0.0.1:6379";
    await writeFile(
      docker,
      `#!/usr/bin/env node\nprocess.stderr.write('Docker rejected ${redisUrl}\\n');\nprocess.exit(1);\n`,
    );
    await chmod(docker, 0o755);

    try {
      const result = await runDirectE2E({
        ...process.env,
        CAT_TEST_SERVICE_LEASE: serializedLease(redisUrl),
        PATH: `${directory}${delimiter}${process.env.PATH ?? ""}`,
      });

      expect(result.code).toBe(1);
      expect(result.stdout).not.toContain("redis-password");
      expect(result.stderr).toContain("redis://[REDACTED]@127.0.0.1:6379");
      expect(result.stderr).not.toContain("redis-password");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  }, 15_000);

  it("keeps required matrix runs retry-free unless a whole-cell retry is explicitly requested", () => {
    expect(parseE2ECommand([])).toEqual({
      concurrency: 2,
      retryFailedCells: false,
      selection: { target: "all" },
    });
    expect(parseE2ECommand(["--retry-failed-cells"])).toEqual({
      concurrency: 2,
      retryFailedCells: true,
      selection: { target: "all" },
    });
    expect(parseE2ECommand(["--concurrency", "1"])).toEqual({
      concurrency: 1,
      retryFailedCells: false,
      selection: { target: "all" },
    });
    expect(() =>
      parseE2ECommand(["--retry-failed-cells", "--retry-failed-cells"]),
    ).toThrow("may only be supplied once");
    expect(() => parseE2ECommand(["--concurrency", "3"])).toThrow(
      "must be 1 or 2",
    );
    expect(() =>
      parseE2ECommand(["--concurrency", "1", "--concurrency", "2"]),
    ).toThrow("may only be supplied once");
  });

  it("creates isolated Chromium and Firefox runtime cells from one attested image pair", async () => {
    const selection: E2ESelection = { target: "runtime" };

    await expect(
      cellsForSelection(selection, lease, {
        runtimeImageId,
        standaloneImageId,
      }),
    ).resolves.toEqual([
      {
        browser: "chromium",
        imageId: runtimeImageId,
        lease,
        preparerImageId: standaloneImageId,
        target: "runtime",
      },
      {
        browser: "firefox",
        imageId: runtimeImageId,
        lease,
        preparerImageId: standaloneImageId,
        target: "runtime",
      },
    ]);
  });

  it("fails closed when a runtime invocation does not carry both release identities", async () => {
    const selection: E2ESelection = { browser: "chromium", target: "runtime" };

    await expect(
      cellsForSelection(selection, lease, { runtimeImageId }),
    ).rejects.toThrow("runtime and standalone preparer image IDs");
  });

  it("fails closed before leasing services when runtime and preparer release identities differ", () => {
    expect(() =>
      assertRuntimeImagePair(
        {
          imageId: standaloneImageId,
          releaseIdentity: "release-a",
          target: "standalone",
        },
        {
          imageId: runtimeImageId,
          releaseIdentity: "release-b",
          target: "runtime",
        },
      ),
    ).toThrow("same release identity");
  });

  it("records the exact release image IDs attested by every completed cell", async () => {
    const path = resolve(tmpdir(), `cat-e2e-attestation-${process.pid}.json`);
    const cells = await cellsForSelection({ target: "all" }, lease, {
      releaseIdentity: "release-a",
      runtimeImageId,
      standaloneImageId,
    });

    await expect(
      writeE2eAttestation(path, cells, {
        releaseIdentity: "release-a",
        runtimeImageId,
        standaloneImageId,
      }),
    ).resolves.toMatchObject({
      cells: [
        { browser: "chromium", target: "dev" },
        { imageId: standaloneImageId, target: "standalone" },
        { imageId: standaloneImageId, target: "standalone" },
        {
          imageId: runtimeImageId,
          preparerImageId: standaloneImageId,
          target: "runtime",
        },
        {
          imageId: runtimeImageId,
          preparerImageId: standaloneImageId,
          target: "runtime",
        },
      ],
      releaseImages: {
        releaseIdentity: "release-a",
        runtimeImageId,
        standaloneImageId,
      },
    });
  });

  it("accepts focused runtime selection without a target-specific command", () => {
    expect(
      parseE2ESelection(["--target", "runtime", "--browser", "firefox"]),
    ).toEqual({
      browser: "firefox",
      target: "runtime",
    });
  });

  it("uses the complete development and release matrix when invoked without arguments", async () => {
    expect(parseE2ESelection([])).toEqual({ target: "all" });

    await expect(
      cellsForSelection({ target: "all" }, lease, {
        runtimeImageId,
        standaloneImageId,
      }),
    ).resolves.toMatchObject([
      { browser: "chromium", target: "dev" },
      { browser: "chromium", target: "standalone" },
      { browser: "firefox", target: "standalone" },
      { browser: "chromium", target: "runtime" },
      { browser: "firefox", target: "runtime" },
    ]);
  });

  it("keeps one browser configuration with a 30-scenario shared release suite", async () => {
    const e2eRoot = import.meta.dirname;
    const config = await readFile(
      resolve(e2eRoot, "playwright.config.ts"),
      "utf8",
    );
    const tests = await Promise.all(
      [
        "auth.spec.ts",
        "branch-workspace.spec.ts",
        "content-graph-file-roundtrip.spec.ts",
        "dev-auth.spec.ts",
        "dev-runtime-probes.spec.ts",
        "editor.spec.ts",
        "lite-smoke.spec.ts",
        "plugin-management.spec.ts",
        "project-shell-refresh.spec.ts",
        "qa-review-workbench.spec.ts",
      ].map(
        async (name) => await readFile(resolve(e2eRoot, "tests", name), "utf8"),
      ),
    );

    expect(config).toContain('name: "runtime-chromium"');
    expect(config).toContain('name: "runtime-firefox"');
    expect(config).toContain("retries: 0");
    expect(config).toContain("workers: 1");
    expect(config).toContain('["dot"]');
    expect(config).toContain("outputFolder: process.env.CAT_E2E_REPORT_DIR");
    expect(config).toContain('trace: "retain-on-failure"');
    expect(tests.join("\n").match(/\btest\(/g)).toHaveLength(30);
    expect(tests.join("\n").match(/@dev-mechanism/g)).toHaveLength(2);
    expect(tests.join("\n")).not.toMatch(/\btest\.(?:only|skip)\b/);
  });
});
