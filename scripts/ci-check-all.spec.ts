import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { promoteBuildxCache, runCiCheckAll } from "./ci-check-all.ts";
import { buildReleaseImages } from "./image-builder.ts";

const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    }),
  );
});

const imageId = `sha256:${"a".repeat(64)}`;

const createCacheScopes = async (cacheRoot: string): Promise<void> => {
  for (const scope of ["buildx", "buildx-next"]) {
    for (const target of ["standalone", "runtime"]) {
      const directory = join(cacheRoot, scope, target);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "index.json"), "{}\n");
    }
  }
};

const buildWithCache = async (cwd: string): Promise<string[]> => {
  const run = vi.fn(async (_command: string, args: string[]) => {
    if (args[0] === "image" && args[1] === "ls") return { stdout: "" };
    if (args[0] === "buildx" && args[1] === "build") {
      const iidfile = args[args.indexOf("--iidfile") + 1];
      if (iidfile === undefined) throw new Error("missing iidfile");
      await writeFile(iidfile, `${imageId}\n`);
    }
    return { stdout: "" };
  });
  await buildReleaseImages({
    buildId: "cache-symlink-regression",
    cwd,
    env: {
      CAT_BUILDX_CACHE_OUTPUT: ".cache/buildx-next",
      CAT_BUILDX_CACHE_SOURCE: ".cache/buildx",
    },
    run,
    signal: new AbortController().signal,
    targets: ["standalone"],
  });
  return (
    vi.mocked(run).mock.calls.find(([, args]) => args[0] === "buildx")?.[1] ??
    []
  );
};

describe("CI check-all cache promotion", () => {
  it("imports every release and CI entrypoint without executing its command", async () => {
    for (const script of [
      "scripts/ci-check-all.ts",
      "scripts/image-artifacts.ts",
      "scripts/image-builder.ts",
      "scripts/verify-base-image.ts",
    ]) {
      const result = await execFileAsync(
        process.execPath,
        ["--input-type=module", "--eval", `await import('./${script}')`],
        { cwd: resolve(import.meta.dirname, "..") },
      );
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
    }
  });

  it("runs the complete gate before exporting release evidence and promoting cache", async () => {
    const events: string[] = [];

    await runCiCheckAll({
      env: {
        CAT_CHECK_ALL_EXPORT_IMAGES_DIR: "validated-images",
      },
      promoteCache: async () => {
        events.push("cache");
      },
      run: async (command, args) => {
        events.push(`${command} ${args.join(" ")}`);
      },
      writeChecksums: async (directory) => {
        events.push(`checksums ${directory}`);
      },
    });

    expect(events).toEqual([
      "pnpm check:all -- --e2e-concurrency 1",
      "checksums validated-images",
      "cache",
    ]);
  });

  it("warns and preserves a successful quality gate when cache replacement fails", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cat-buildx-promotion-failure-"));
    temporaryDirectories.push(cwd);
    await createCacheScopes(join(cwd, ".cache"));
    const warning = vi.fn();

    await expect(
      promoteBuildxCache({
        env: {
          CAT_BUILDX_CACHE_OUTPUT: ".cache/buildx-next",
          CAT_BUILDX_CACHE_SOURCE: ".cache/buildx",
        },
        allowedCacheRoot: join(cwd, ".cache"),
        cwd,
        fs: {
          rename: async () => {
            throw new Error("cross-device link");
          },
          rm: async () => undefined,
        },
        warning,
        write: vi.fn(),
      }),
    ).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("could not promote"),
    );
  });

  it("promotes only two complete, validated cache scopes", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cat-buildx-promotion-"));
    temporaryDirectories.push(cwd);
    for (const target of ["standalone", "runtime"]) {
      await mkdir(join(cwd, ".cache", "buildx-next", target), {
        recursive: true,
      });
      await writeFile(
        join(cwd, ".cache", "buildx-next", target, "index.json"),
        "{}\n",
        { encoding: "utf8", flag: "w" },
      );
    }
    const writes: string[] = [];

    await promoteBuildxCache({
      env: {
        CAT_BUILDX_CACHE_OUTPUT: ".cache/buildx-next",
        CAT_BUILDX_CACHE_SOURCE: ".cache/buildx",
      },
      allowedCacheRoot: join(cwd, ".cache"),
      cwd,
      write: (message) => writes.push(message),
    });

    expect(writes).toEqual(["container external-cache=saved\n"]);
  });

  it("preserves the previous cache when replacing it fails", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cat-buildx-promotion-restore-"));
    temporaryDirectories.push(cwd);
    await createCacheScopes(join(cwd, ".cache"));
    const source = resolve(cwd, ".cache/buildx");
    const output = resolve(cwd, ".cache/buildx-next");
    const renamed: [string, string][] = [];
    const warning = vi.fn();
    const fs = {
      rename: vi.fn(async (from: string, to: string) => {
        renamed.push([from, to]);
        if (from === output) throw new Error("cross-device link");
      }),
      rm: vi.fn(async () => undefined),
    };

    await promoteBuildxCache({
      env: {
        CAT_BUILDX_CACHE_OUTPUT: ".cache/buildx-next",
        CAT_BUILDX_CACHE_SOURCE: ".cache/buildx",
      },
      allowedCacheRoot: resolve(cwd, ".cache"),
      cwd,
      fs,
      warning,
    });

    const previous = `${source}.previous-${process.pid}`;
    expect(renamed).toEqual([
      [source, previous],
      [output, source],
      [previous, source],
    ]);
    expect(fs.rm).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("could not promote"),
    );
  });

  it("does not replace an old cache when either target scope is incomplete", async () => {
    const cwd = await mkdtemp(
      join(tmpdir(), "cat-buildx-promotion-incomplete-"),
    );
    temporaryDirectories.push(cwd);
    await mkdir(join(cwd, ".cache", "buildx-next", "standalone"), {
      recursive: true,
    });
    await writeFile(
      join(cwd, ".cache", "buildx-next", "standalone", "index.json"),
      "{}\n",
    );
    const rename = vi.fn(async () => undefined);
    const rm = vi.fn(async () => undefined);
    const warning = vi.fn();

    await promoteBuildxCache({
      env: {
        CAT_BUILDX_CACHE_OUTPUT: ".cache/buildx-next",
        CAT_BUILDX_CACHE_SOURCE: ".cache/buildx",
      },
      allowedCacheRoot: join(cwd, ".cache"),
      cwd,
      fs: {
        rename,
        rm,
      },
      warning,
    });

    expect(rename).not.toHaveBeenCalled();
    expect(rm).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("invalid Buildx cache configuration"),
    );
  });

  it.each([
    ["same", ".cache/buildx", ".cache/buildx"],
    ["nested", ".cache/buildx", ".cache/buildx/next"],
    ["workspace", ".cache/buildx", "outside-cache"],
    ["csv injection", ".cache/buildx,mode=max", ".cache/buildx-next"],
    ["newline injection", ".cache/buildx", ".cache/buildx-next\nfoo"],
  ])(
    "refuses %s cache paths without recursive deletion",
    async (_name, source, output) => {
      const rm = vi.fn(async () => undefined);
      const warning = vi.fn();

      await promoteBuildxCache({
        env: {
          CAT_BUILDX_CACHE_OUTPUT: output,
          CAT_BUILDX_CACHE_SOURCE: source,
        },
        allowedCacheRoot: resolve(".cache"),
        cwd: process.cwd(),
        fs: {
          rename: async () => undefined,
          rm,
        },
        warning,
      });

      expect(rm).not.toHaveBeenCalled();
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining("invalid Buildx cache configuration"),
      );
    },
  );

  it.each([
    "cache-root-parent",
    "source",
    "output",
    "target-scope",
    "index-marker",
  ] as const)(
    "disables Buildx cache and preserves external data when %s is a symbolic link",
    async (kind) => {
      const cwd = await mkdtemp(join(tmpdir(), "cat-buildx-cache-symlink-"));
      const external = await mkdtemp(
        join(tmpdir(), "cat-buildx-cache-external-"),
      );
      temporaryDirectories.push(cwd, external);
      const cacheRoot = join(cwd, ".cache");
      const externalCacheRoot = join(external, ".cache");
      await createCacheScopes(cacheRoot);
      await createCacheScopes(externalCacheRoot);
      const sentinel = join(external, "sentinel");
      await writeFile(sentinel, "unchanged\n");

      if (kind === "cache-root-parent") {
        await rm(cacheRoot, { force: true, recursive: true });
        await symlink(externalCacheRoot, cacheRoot, "dir");
      } else if (kind === "source") {
        await rm(join(cacheRoot, "buildx"), { force: true, recursive: true });
        await symlink(
          join(externalCacheRoot, "buildx"),
          join(cacheRoot, "buildx"),
          "dir",
        );
      } else if (kind === "output") {
        await rm(join(cacheRoot, "buildx-next"), {
          force: true,
          recursive: true,
        });
        await symlink(
          join(externalCacheRoot, "buildx-next"),
          join(cacheRoot, "buildx-next"),
          "dir",
        );
      } else if (kind === "target-scope") {
        await rm(join(cacheRoot, "buildx-next", "standalone"), {
          force: true,
          recursive: true,
        });
        await symlink(
          join(externalCacheRoot, "buildx-next", "standalone"),
          join(cacheRoot, "buildx-next", "standalone"),
          "dir",
        );
      } else {
        const marker = join(
          cacheRoot,
          "buildx-next",
          "standalone",
          "index.json",
        );
        await rm(marker, { force: true });
        await symlink(
          join(externalCacheRoot, "buildx-next", "standalone", "index.json"),
          marker,
          "file",
        );
      }

      const build = await buildWithCache(cwd);
      const rename = vi.fn(async () => undefined);
      const remove = vi.fn(async () => undefined);
      const warning = vi.fn();
      await promoteBuildxCache({
        allowedCacheRoot: cacheRoot,
        cwd,
        env: {
          CAT_BUILDX_CACHE_OUTPUT: ".cache/buildx-next",
          CAT_BUILDX_CACHE_SOURCE: ".cache/buildx",
        },
        fs: { rename, rm: remove },
        warning,
      });

      expect(build).not.toContain("--cache-from");
      expect(build).not.toContain("--cache-to");
      expect(rename).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      await expect(readFile(sentinel, "utf8")).resolves.toBe("unchanged\n");
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining("invalid Buildx cache configuration"),
      );
    },
  );
});
