import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { validateBuildxCachePaths } from "./buildx-cache.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    }),
  );
});

describe("Buildx cache path validation", () => {
  it("imports only source scopes with a directory and OCI marker", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cat-buildx-cache-source-"));
    temporaryDirectories.push(cwd);
    const completeScope = join(cwd, ".cache", "buildx", "standalone");
    const incompleteScope = join(cwd, ".cache", "buildx", "runtime");
    await mkdir(completeScope, { recursive: true });
    await mkdir(incompleteScope, { recursive: true });
    await writeFile(join(completeScope, "index.json"), "{}\n");

    await expect(
      validateBuildxCachePaths({
        allowedCacheRoot: ".cache",
        cwd,
        source: ".cache/buildx",
      }),
    ).resolves.toEqual({
      paths: { source: resolve(cwd, ".cache/buildx") },
      sourceScopes: { runtime: false, spacy: false, standalone: true },
      valid: true,
    });
  });
});
