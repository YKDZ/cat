import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  finalizeBuildxFamilyCache,
  validateBuildxCachePaths,
} from "./buildx-cache.ts";
import { parseBuildxCacheFamily } from "./finalize-buildx-cache.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    }),
  );
});

describe("Buildx cache path validation", () => {
  it("accepts exactly one supported build family from package-script arguments", () => {
    expect(parseBuildxCacheFamily(["--", "application"])).toBe("application");
    expect(parseBuildxCacheFamily(["spacy"])).toBe("spacy");
    expect(() => parseBuildxCacheFamily(["runtime"])).toThrow("Usage");
    expect(() => parseBuildxCacheFamily(["application", "spacy"])).toThrow(
      "Usage",
    );
  });

  it("imports only build-family scopes with a directory and OCI marker", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cat-buildx-cache-source-"));
    temporaryDirectories.push(cwd);
    const completeScope = join(cwd, ".cache", "buildx", "application");
    const incompleteScope = join(cwd, ".cache", "buildx", "spacy");
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
      sourceScopes: { application: true, spacy: false },
      valid: true,
    });
  });

  it("atomically replaces only the selected complete build-family scope", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cat-buildx-cache-finalize-"));
    temporaryDirectories.push(cwd);
    for (const family of ["application", "spacy"] as const) {
      for (const root of ["buildx", "buildx-next"] as const) {
        const scope = join(cwd, ".cache", root, family);
        await mkdir(scope, { recursive: true });
        await writeFile(join(scope, "index.json"), "{}\n");
        await writeFile(join(scope, "identity"), `${root}-${family}\n`);
      }
    }

    await finalizeBuildxFamilyCache({
      allowedCacheRoot: ".cache",
      cwd,
      family: "application",
      output: ".cache/buildx-next",
      source: ".cache/buildx",
    });

    await expect(
      readFile(join(cwd, ".cache/buildx/application/identity"), "utf8"),
    ).resolves.toBe("buildx-next-application\n");
    await expect(
      readFile(join(cwd, ".cache/buildx/spacy/identity"), "utf8"),
    ).resolves.toBe("buildx-spacy\n");
    await expect(
      readFile(join(cwd, ".cache/buildx-next/spacy/identity"), "utf8"),
    ).resolves.toBe("buildx-next-spacy\n");
    await expect(
      access(join(cwd, ".cache/buildx-next/application")),
    ).rejects.toThrow();
  });

  it("rejects an incomplete family export before replacing its source", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cat-buildx-cache-incomplete-"));
    temporaryDirectories.push(cwd);
    const source = join(cwd, ".cache/buildx/application");
    const output = join(cwd, ".cache/buildx-next/application");
    await mkdir(source, { recursive: true });
    await mkdir(output, { recursive: true });
    await writeFile(join(source, "index.json"), "{}\n");
    await writeFile(join(source, "identity"), "source\n");

    await expect(
      finalizeBuildxFamilyCache({
        allowedCacheRoot: ".cache",
        cwd,
        family: "application",
        output: ".cache/buildx-next",
        source: ".cache/buildx",
      }),
    ).rejects.toThrow("missing cache path");
    await expect(readFile(join(source, "identity"), "utf8")).resolves.toBe(
      "source\n",
    );
  });
});
