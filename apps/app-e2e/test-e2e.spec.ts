import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertRuntimeImagePair,
  cellsForSelection,
  parseE2ECommand,
  parseE2ESelection,
  writeE2eAttestation,
  type E2ESelection,
} from "./test-e2e.ts";

const lease = {} as Parameters<typeof cellsForSelection>[1];
const standaloneImageId = `sha256:${"a".repeat(64)}`;
const runtimeImageId = `sha256:${"b".repeat(64)}`;

describe("release E2E selection", () => {
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

  it("keeps one browser configuration with a 24-scenario shared release suite", async () => {
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
    expect(tests.join("\n").match(/\btest\(/g)).toHaveLength(28);
    expect(tests.join("\n").match(/@dev-mechanism/g)).toHaveLength(2);
    expect(tests.join("\n")).not.toMatch(/\btest\.(?:only|skip)\b/);
  });
});
