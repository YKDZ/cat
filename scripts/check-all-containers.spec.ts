import { readFileSync, readdirSync, rmSync } from "node:fs";
import { relative, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  exportValidatedImages,
  runApplicationLifecycle,
} from "./check-all-containers.ts";
import { CommandExecutionError, type CommandRunner } from "./check-all.ts";

const standaloneImageId = `sha256:${"a".repeat(64)}`;
const runtimeImageId = `sha256:${"b".repeat(64)}`;
const releaseImages = {
  images: [
    { imageId: standaloneImageId, target: "standalone" as const },
    { imageId: runtimeImageId, target: "runtime" as const },
  ],
};

const searchRuntimeSqlPattern =
  /\b(?:CREATE\s+EXTENSION|CREATE\s+TEXT\s+SEARCH\s+CONFIGURATION|ALTER\s+TEXT\s+SEARCH\s+CONFIGURATION)\b/i;
const searchRuntimeSqlFixturePaths = new Set([
  "packages/domain/src/testing/setup-test-db.ts",
  "packages/test-utils/src/test-db.ts",
  "scripts/pglite-compat-gate.ts",
]);
const searchableSourceExtensions = new Set([".js", ".mjs", ".sql", ".ts"]);

const sourceFilesUnder = (directory: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (["declarations", "dist", "node_modules"].includes(entry.name))
        continue;
      files.push(...sourceFilesUnder(path));
      continue;
    }
    if (
      entry.isFile() &&
      searchableSourceExtensions.has(
        entry.name.slice(entry.name.lastIndexOf(".")),
      ) &&
      !entry.name.endsWith(".spec.ts") &&
      !entry.name.endsWith(".test.ts")
    ) {
      files.push(path);
    }
  }
  return files;
};

const runLifecycle = async (
  context: Parameters<typeof runApplicationLifecycle>[0],
): Promise<void> =>
  await runApplicationLifecycle(
    {
      ...context,
      env: {
        SPACY_SERVER_URL: "http://127.0.0.1:49155",
        ...context.env,
      },
    },
    releaseImages,
  );

const lifecycleRunner = (
  onCall?: (args: string[], signal: AbortSignal | undefined) => void,
  releaseImageBuildId?: string,
): CommandRunner => {
  let buildId = "";
  const runner: CommandRunner = async (command, args, options) => {
    expect(command).toBe("docker");
    onCall?.(args, options.signal);
    if (args[0] === "build") {
      buildId =
        args
          .find((arg) => arg.startsWith("DEPLOYMENT_BUILD_ID="))
          ?.slice("DEPLOYMENT_BUILD_ID=".length) ?? "";
    }
    if (args.includes("{{json .Config}}")) {
      const mode = args.includes(standaloneImageId) ? "standalone" : "runtime";
      return {
        stdout: JSON.stringify({
          Cmd: [mode === "standalone" ? "prepare-and-start" : "start-only"],
          Entrypoint: ["/usr/local/bin/container-entrypoint"],
          Healthcheck: {
            Test: ["CMD-SHELL", "node /usr/local/bin/docker-health-check.js"],
          },
          Labels: {
            "org.opencontainers.image.version": releaseImageBuildId ?? buildId,
          },
          User: "1001:1001",
          Volumes: { "/data": {} },
        }),
      };
    }
    if (args.includes("inspect") && args.includes("{{.State.Health.Status}}")) {
      return { stdout: "healthy\n" };
    }
    if (
      args[0] === "run" &&
      args.includes("--entrypoint") &&
      args.includes("node") &&
      args.includes(runtimeImageId) &&
      args.some((arg) =>
        [
          "/app/.preparation/prepare-database.mjs",
          "/app/dist/bootstrap-only/bootstrap-only-cli.js",
          "/app/scripts/bootstrap-local.mjs",
          "/app/scripts/container-entrypoint-standalone.sh",
          "/app/scripts/copy-drizzle.ts",
          "/app/scripts/dev.ts",
        ].includes(arg),
      )
    ) {
      throw new CommandExecutionError(
        "runtime does not contain lifecycle implementation",
        1,
        null,
      );
    }
    if (
      args[0] === "run" &&
      (args.includes("prepare-only") ||
        args.includes("bootstrap-only") ||
        args.includes("prepare-and-start")) &&
      args.includes(runtimeImageId)
    ) {
      throw new CommandExecutionError(
        "runtime rejected lifecycle command",
        64,
        null,
      );
    }
    if (
      args[0] === "run" &&
      args.includes("start-only") &&
      args.includes(standaloneImageId)
    ) {
      throw new CommandExecutionError(
        "standalone rejected start-only",
        64,
        null,
      );
    }
    return { stdout: "" };
  };
  return vi.fn(runner);
};

describe("application container lifecycle", () => {
  it("validates supplied images against an explicit release build ID", async () => {
    const run = lifecycleRunner(undefined, "release-identity");
    await runLifecycle({
      buildId: "release-identity",
      env: {
        DATABASE_URL: "postgresql://user:pass@127.0.0.1:49152/cat",
        REDIS_URL: "redis://127.0.0.1:49153",
      },
      projectName: "cat-container-explicit-build-id",
      run,
      signal: new AbortController().signal,
    });
  });

  it("builds only the context contract and verifies the supplied immutable final images", async () => {
    const run = lifecycleRunner();
    await runLifecycle({
      env: {
        DATABASE_URL: "postgresql://user:pass@127.0.0.1:49152/cat",
        REDIS_URL: "redis://127.0.0.1:49153",
      },
      projectName: "cat-container-contract",
      run,
      signal: new AbortController().signal,
    });

    const calls = vi.mocked(run).mock.calls.map(([, args]) => args);
    const buildTargets = calls
      .filter((args) => args[0] === "build")
      .map((args) => args[args.indexOf("--target") + 1]);
    expect(buildTargets).toEqual(["context-contract"]);
    expect(
      calls
        .filter((args) => args[0] === "build")
        .map((args) =>
          args.find((arg) => arg.startsWith("DEPLOYMENT_BUILD_ID=")),
        ),
    ).toEqual(["DEPLOYMENT_BUILD_ID=cat-container-contract"]);
    expect(
      calls.some(
        (args) => args.includes("--entrypoint") && args.includes("/bin/sh"),
      ),
    ).toBe(true);
    expect(calls.at(-1)).toEqual(
      expect.arrayContaining(["image", "rm", "--force"]),
    );
  });

  it("prepares, bootstraps, and starts a fresh standalone lifecycle database before runtime starts", async () => {
    const run = lifecycleRunner();
    await runLifecycle({
      env: {
        DATABASE_URL: "postgresql://user:pass@127.0.0.1:49152/cat_integration",
        REDIS_URL: "redis://127.0.0.1:49153",
      },
      projectName: "cat-container-lifecycle-db",
      run,
      signal: new AbortController().signal,
    });

    const calls = vi.mocked(run).mock.calls.map(([, args]) => args);
    const createIndex = calls.findIndex(
      (args) =>
        args[0] === "exec" &&
        args.some((arg) => arg.startsWith("CREATE DATABASE ")),
    );
    const dropIndex = calls.findIndex(
      (args) =>
        args[0] === "exec" &&
        args.some((arg) => arg.startsWith("DROP DATABASE ")),
    );
    const standalonePreparations = calls.filter(
      (args) =>
        args[0] === "run" &&
        args.includes("prepare-only") &&
        args.includes(standaloneImageId),
    );
    const standaloneBootstraps = calls.filter(
      (args) =>
        args[0] === "run" &&
        args.includes("bootstrap-only") &&
        args.includes(standaloneImageId),
    );
    const searchRuntimeSetupIndex = calls.findIndex(
      (args) =>
        args[0] === "exec" &&
        args.some((arg) => arg.startsWith("cat_lifecycle_")) &&
        args.some((arg) =>
          arg.includes("CREATE EXTENSION IF NOT EXISTS pg_trgm"),
        ),
    );

    expect(createIndex).toBeGreaterThan(-1);
    expect(searchRuntimeSetupIndex).toBeGreaterThan(createIndex);
    expect(standalonePreparations).toHaveLength(2);
    expect(standaloneBootstraps).toHaveLength(1);
    const secondPreparation = standalonePreparations.at(1);
    if (secondPreparation === undefined) {
      throw new Error("Expected two standalone preparations");
    }
    const standaloneBootstrap = standaloneBootstraps[0];
    if (standaloneBootstrap === undefined) {
      throw new Error("Expected one standalone bootstrap");
    }
    expect(searchRuntimeSetupIndex).toBeLessThan(
      calls.indexOf(secondPreparation),
    );
    expect(calls.indexOf(secondPreparation)).toBeLessThan(
      calls.indexOf(standaloneBootstrap),
    );
    expect(dropIndex).toBeGreaterThan(calls.indexOf(secondPreparation));

    const databaseUrl = standalonePreparations[0].find((arg) =>
      arg.startsWith("DATABASE_URL="),
    );
    expect(databaseUrl).toMatch(
      /^DATABASE_URL=postgresql:\/\/user:pass@postgresql:5432\/cat_lifecycle_[a-f0-9]{32}$/,
    );
    expect(databaseUrl).not.toContain("cat_integration");
  });

  it("uses the PostgreSQL image initialization file as the only search runtime SQL source", () => {
    const canonicalSql = readFileSync(
      "apps/postgres-search-runtime/init/01-init-extensions.sql",
      "utf8",
    );
    const lifecycleSource = readFileSync(
      "scripts/check-all-containers.ts",
      "utf8",
    );
    const executionCellSource = readFileSync(
      "apps/app-e2e/execution-cell.ts",
      "utf8",
    );

    expect(canonicalSql).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    expect(lifecycleSource).toContain("searchRuntimeInitializationPath");
    expect(executionCellSource).toContain("searchRuntimeInitializationPath");
    expect(lifecycleSource).not.toContain(
      "const initializeSearchRuntimeCommand",
    );
    expect(executionCellSource).not.toContain(
      "CREATE EXTENSION IF NOT EXISTS ${extension}",
    );
  });

  it("keeps production search runtime DDL in the image initialization file", () => {
    const repositoryRoot = process.cwd();
    const canonicalPath =
      "apps/postgres-search-runtime/init/01-init-extensions.sql";
    const declarations = ["apps", "packages", "scripts", "tools"]
      .flatMap((directory) =>
        sourceFilesUnder(resolve(repositoryRoot, directory)),
      )
      .map((path) => ({
        path: relative(repositoryRoot, path),
        source: readFileSync(path, "utf8"),
      }))
      .filter(
        ({ path, source }) =>
          searchRuntimeSqlPattern.test(source) &&
          !searchRuntimeSqlFixturePaths.has(path),
      )
      .map(({ path }) => path);

    expect(declarations).toEqual([canonicalPath]);
    for (const path of searchRuntimeSqlFixturePaths) {
      expect(readFileSync(resolve(repositoryRoot, path), "utf8")).toMatch(
        searchRuntimeSqlPattern,
      );
    }
  });

  it("shares lifecycle storage and supplies the production service bootstrap plan", async () => {
    const run = lifecycleRunner();
    await runLifecycle({
      env: {
        DATABASE_URL: "postgresql://user:pass@127.0.0.1:49152/cat",
        REDIS_URL: "redis://127.0.0.1:49153",
      },
      projectName: "cat-container-lifecycle-storage",
      run,
      signal: new AbortController().signal,
    });

    const calls = vi.mocked(run).mock.calls.map(([, args]) => args);
    const storageVolume = "cat-container-lifecycle-storage-lifecycle-storage";
    const storageMount = `type=volume,src=${storageVolume},dst=/data/storage`;
    const bootstrap = calls.find(
      (args) =>
        args[0] === "run" &&
        args.includes("bootstrap-only") &&
        args.includes(standaloneImageId),
    );
    if (bootstrap === undefined) {
      throw new Error("Expected standalone bootstrap command");
    }

    expect(calls).toContainEqual(["volume", "create", storageVolume]);
    expect(calls).toContainEqual(["volume", "rm", "--force", storageVolume]);
    for (const command of [
      "prepare-only",
      "bootstrap-only",
      "prepare-and-start",
      "start-only",
    ]) {
      const commandCall = calls.find(
        (args) => args[0] === "run" && args.includes(command),
      );
      expect(commandCall).toEqual(
        expect.arrayContaining(["--mount", storageMount]),
      );
    }

    const plan = bootstrap.find((argument) =>
      argument.startsWith("CAT_BOOTSTRAP_PLAN="),
    );
    expect(plan).toBeDefined();
    expect(JSON.parse(plan?.slice("CAT_BOOTSTRAP_PLAN=".length) ?? "")).toEqual(
      {
        idempotencyKey: "cat-container-lifecycle-storage-lifecycle-services-v1",
        operations: [
          {
            pluginId: "local-storage-provider",
            scopeId: "",
            scopeType: "GLOBAL",
            type: "install-if-absent",
            value: { "root-path": "/data/storage" },
          },
          {
            pluginId: "spacy-segmenter",
            scopeId: "",
            scopeType: "GLOBAL",
            type: "install-if-absent",
            value: { serverUrl: "http://spacy:8000" },
          },
        ],
        version: "1",
      },
    );
  });

  it("uses the injected service lease project for database and network resources", async () => {
    const run = lifecycleRunner();
    await runLifecycle({
      env: {
        CAT_TEST_SERVICE_LEASE: JSON.stringify({
          coordinates: {
            databaseUrl: "postgresql://user:pass@127.0.0.1:49152/postgres",
            redisUrl: "redis://127.0.0.1:49153",
            spacyUrl: "http://127.0.0.1:49155",
          },
          ownership: {
            projectName: "cat-e2e-leased-services",
            token: "lease-token",
          },
          version: 1,
        }),
        DATABASE_URL: "postgresql://user:pass@127.0.0.1:49152/postgres",
        REDIS_URL: "redis://127.0.0.1:49153",
      },
      projectName: "cat-check-all-build-id",
      run,
      signal: new AbortController().signal,
    });

    const calls = vi.mocked(run).mock.calls.map(([, args]) => args);
    const databaseCommand = calls.find(
      (args) =>
        args[0] === "exec" &&
        args.some((arg) => arg.startsWith("CREATE DATABASE ")),
    );
    expect(databaseCommand).toContain("cat-e2e-leased-services-postgresql-1");
    expect(
      calls.some(
        (args) =>
          args[0] === "run" &&
          args.includes("--network") &&
          args.includes("cat-e2e-leased-services_default"),
      ),
    ).toBe(true);
    expect(
      calls.some((args) =>
        args.includes("SPACY_SERVER_URL=http://spacy:8000/"),
      ),
    ).toBe(true);
  });

  it("probes every lifecycle command that each target must reject", async () => {
    const run = lifecycleRunner();
    await runLifecycle({
      env: {
        DATABASE_URL: "postgresql://user:pass@127.0.0.1:49152/cat",
        REDIS_URL: "redis://127.0.0.1:49153",
      },
      projectName: "cat-container-command-rejections",
      run,
      signal: new AbortController().signal,
    });

    const calls = vi.mocked(run).mock.calls.map(([, args]) => args);
    for (const command of [
      "prepare-only",
      "bootstrap-only",
      "prepare-and-start",
    ]) {
      expect(
        calls.some(
          (args) =>
            args[0] === "run" &&
            args.includes(command) &&
            args.includes(runtimeImageId),
        ),
        `runtime should reject ${command}`,
      ).toBe(true);
    }
    expect(
      calls.some(
        (args) =>
          args[0] === "run" &&
          args.includes("start-only") &&
          args.includes(standaloneImageId),
      ),
    ).toBe(true);
    expect(
      calls.some(
        (args) =>
          args.includes("CONTAINER_CAPABILITY=prepare-and-start") &&
          args.includes("bootstrap-only") &&
          args.includes(runtimeImageId),
      ),
      "runtime should reject an environment capability override",
    ).toBe(true);
  });

  it("probes runtime lifecycle implementation paths through a direct node entrypoint", async () => {
    const run = lifecycleRunner();
    await runLifecycle({
      env: {
        DATABASE_URL: "postgresql://user:pass@127.0.0.1:49152/cat",
        REDIS_URL: "redis://127.0.0.1:49153",
      },
      projectName: "cat-container-direct-node",
      run,
      signal: new AbortController().signal,
    });

    const calls = vi.mocked(run).mock.calls.map(([, args]) => args);
    for (const implementation of [
      "/app/.preparation/prepare-database.mjs",
      "/app/dist/bootstrap-only/bootstrap-only-cli.js",
      "/app/scripts/bootstrap-local.mjs",
      "/app/scripts/container-entrypoint-standalone.sh",
      "/app/scripts/copy-drizzle.ts",
      "/app/scripts/dev.ts",
    ]) {
      expect(
        calls.some(
          (args) =>
            args.includes("--entrypoint") &&
            args.includes("node") &&
            args.includes(implementation) &&
            args.includes(runtimeImageId),
        ),
        `runtime should not expose ${implementation}`,
      ).toBe(true);
    }
  });

  it("terminates lifecycle database clients before dropping it with a fresh bounded signal", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    let lifecycleCleanupSignal: AbortSignal | undefined;
    const run = lifecycleRunner((args, signal) => {
      if (
        args[0] === "exec" &&
        args.some((arg) => arg.includes("pg_terminate_backend"))
      ) {
        lifecycleCleanupSignal = signal;
      }
    });

    await runLifecycle({
      env: {
        DATABASE_URL: "postgresql://user:pass@127.0.0.1:49152/cat",
        REDIS_URL: "redis://127.0.0.1:49153",
      },
      projectName: "cat-container-terminate-clients",
      run,
      signal: new AbortController().signal,
    });

    const calls = vi.mocked(run).mock.calls.map(([, args]) => args);
    const terminateIndex = calls.findIndex((args) =>
      args.some((arg) => arg.includes("pg_terminate_backend")),
    );
    const dropIndex = calls.findIndex((args) =>
      args.some((arg) => arg.startsWith("DROP DATABASE ")),
    );
    const runtimeRemovalIndex = calls.findIndex(
      (args) =>
        args[0] === "rm" &&
        args.includes("cat-container-terminate-clients-runtime"),
    );
    expect(terminateIndex).toBeGreaterThan(-1);
    expect(dropIndex).toBeGreaterThan(terminateIndex);
    expect(runtimeRemovalIndex).toBeGreaterThan(-1);
    expect(runtimeRemovalIndex).toBeLessThan(terminateIndex);
    expect(lifecycleCleanupSignal).toBeDefined();
    expect(lifecycleCleanupSignal?.aborted).toBe(false);
    expect(timeout).toHaveBeenCalledWith(60_000);
  });

  it("retries a transient lifecycle database drop failure", async () => {
    const baseRun = lifecycleRunner();
    let dropAttempts = 0;
    const run = vi.fn(async (command, args, options) => {
      if (args.some((arg) => arg.startsWith("DROP DATABASE "))) {
        dropAttempts += 1;
        if (dropAttempts === 1) {
          throw new CommandExecutionError("drop still has a client", 1, null);
        }
      }
      return await baseRun(command, args, options);
    });

    await runLifecycle({
      env: {
        DATABASE_URL: "postgresql://user:pass@127.0.0.1:49152/cat",
        REDIS_URL: "redis://127.0.0.1:49153",
      },
      projectName: "cat-container-retry-drop",
      run,
      signal: new AbortController().signal,
    });

    expect(dropAttempts).toBe(2);
  });

  it("propagates a lifecycle database cleanup failure", async () => {
    const baseRun = lifecycleRunner();
    const run = vi.fn(async (command, args, options) => {
      if (args.some((arg) => arg.startsWith("DROP DATABASE "))) {
        throw new CommandExecutionError("drop failed", 1, null);
      }
      return await baseRun(command, args, options);
    });

    await expect(
      runLifecycle({
        env: {
          DATABASE_URL: "postgresql://user:pass@127.0.0.1:49152/cat",
          REDIS_URL: "redis://127.0.0.1:49153",
        },
        projectName: "cat-container-drop-error",
        run,
        signal: new AbortController().signal,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([
        expect.objectContaining({ message: "drop failed" }),
      ]);
      return true;
    });
  });

  it("preserves the primary lifecycle failure alongside storage, database, and temporary-image cleanup failures", async () => {
    const baseRun = lifecycleRunner();
    const run = vi.fn(async (command, args, options) => {
      if (args.includes("prepare-only") && args.includes(standaloneImageId)) {
        throw new Error("primary preparation failure");
      }
      if (args[0] === "volume" && args[1] === "rm") {
        throw new Error("storage cleanup failure");
      }
      if (args.some((arg) => arg.startsWith("DROP DATABASE "))) {
        throw new Error("database cleanup failure");
      }
      if (args[0] === "image" && args[1] === "rm") {
        throw new Error("temporary image cleanup failure");
      }
      return await baseRun(command, args, options);
    });

    await expect(
      runLifecycle({
        env: {
          DATABASE_URL: "postgresql://user:pass@127.0.0.1:49152/cat",
          REDIS_URL: "redis://127.0.0.1:49153",
        },
        projectName: "cat-container-aggregate-cleanup",
        run,
        signal: new AbortController().signal,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AggregateError);
      expect(
        (error as AggregateError).errors.map((item) => String(item)),
      ).toEqual(
        expect.arrayContaining([
          expect.stringContaining("primary preparation failure"),
          expect.stringContaining("storage cleanup failure"),
          expect.stringContaining("database cleanup failure"),
          expect.stringContaining("temporary image cleanup failure"),
        ]),
      );
      return true;
    });
  });

  it("removes the lifecycle database when preparation fails", async () => {
    const baseRun = lifecycleRunner();
    let standalonePreparations = 0;
    const run = vi.fn(async (command, args, options) => {
      if (args.includes("prepare-only") && args.includes(standaloneImageId)) {
        standalonePreparations += 1;
        if (standalonePreparations === 2) {
          throw new CommandExecutionError("second preparation failed", 1, null);
        }
      }
      return await baseRun(command, args, options);
    });

    await expect(
      runLifecycle({
        env: {
          DATABASE_URL:
            "postgresql://user:pass@127.0.0.1:49152/cat_integration",
          REDIS_URL: "redis://127.0.0.1:49153",
        },
        projectName: "cat-container-cleanup-db",
        run,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("second preparation failed");

    const calls = vi.mocked(run).mock.calls.map(([, args]) => args);
    const createIndex = calls.findIndex((args) =>
      args.some((arg) => arg.startsWith("CREATE DATABASE ")),
    );
    const dropIndex = calls.findIndex((args) =>
      args.some((arg) => arg.startsWith("DROP DATABASE ")),
    );
    expect(dropIndex).toBeGreaterThan(createIndex);
    expect(calls).toContainEqual([
      "volume",
      "rm",
      "--force",
      "cat-container-cleanup-db-lifecycle-storage",
    ]);
  });

  it("exports both images only after the separate lifecycle stage passes", async () => {
    const exportDirectory = `/tmp/cat-validated-images-${process.pid}`;
    const run = lifecycleRunner();
    const context = {
      env: {
        CAT_CHECK_ALL_EXPORT_IMAGES_DIR: exportDirectory,
        DATABASE_URL: "postgresql://user:pass@127.0.0.1:49152/cat",
        REDIS_URL: "redis://127.0.0.1:49153",
      },
      projectName: "cat-container-export",
      run,
      signal: new AbortController().signal,
    };
    await runLifecycle(context);
    await exportValidatedImages(context, releaseImages);

    try {
      const calls = vi.mocked(run).mock.calls.map(([, args]) => args);
      const saves = calls.filter(
        (args) => args[0] === "image" && args[1] === "save",
      );
      expect(saves).toEqual([
        [
          "image",
          "save",
          "--output",
          `${exportDirectory}/standalone.tar`,
          standaloneImageId,
        ],
        [
          "image",
          "save",
          "--output",
          `${exportDirectory}/runtime.tar`,
          runtimeImageId,
        ],
      ]);
      expect(
        JSON.parse(readFileSync(`${exportDirectory}/manifest.json`, "utf8")),
      ).toMatchObject({
        images: {
          runtime: {
            identity: {
              command: "start-only",
              description: "CAT start-only application runtime",
              versionLabel: "cat-container-export",
            },
            imageId: runtimeImageId,
          },
          standalone: {
            identity: {
              command: "prepare-and-start",
              versionLabel: "cat-container-export",
            },
            imageId: standaloneImageId,
          },
        },
        schemaVersion: 1,
      });
      const firstSave = saves.at(0);
      if (firstSave === undefined)
        throw new Error("Expected standalone export");
      expect(calls.indexOf(firstSave)).toBeGreaterThan(
        calls.findIndex(
          (args) =>
            args.includes("prepare-only") && args.includes(runtimeImageId),
        ),
      );
    } finally {
      rmSync(exportDirectory, { force: true, recursive: true });
    }
  });

  it("uses a fresh bounded signal to remove a server after the lifecycle is aborted", async () => {
    const controller = new AbortController();
    let cleanupSignal: AbortSignal | undefined;
    const run = lifecycleRunner((args, signal) => {
      if (args.includes("{{.State.Health.Status}}")) controller.abort();
      if (args[0] === "rm" && args.includes("--force")) cleanupSignal = signal;
    });

    await expect(
      runLifecycle({
        env: {
          DATABASE_URL: "postgresql://user:pass@127.0.0.1:49152/cat",
          REDIS_URL: "redis://127.0.0.1:49153",
        },
        projectName: "cat-container-abort",
        run,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(controller.signal.aborted).toBe(true);
    expect(cleanupSignal).toBeDefined();
    expect(cleanupSignal).not.toBe(controller.signal);
    expect(cleanupSignal?.aborted).toBe(false);
  });

  it("accepts only exit code 64 as runtime preparation rejection", async () => {
    const baseRun = lifecycleRunner();
    const runner: CommandRunner = async (command, args, options) => {
      if (args.includes("prepare-only") && args.includes(runtimeImageId)) {
        throw new CommandExecutionError("runtime crashed", 1, null);
      }
      return await baseRun(command, args, options);
    };
    const run = vi.fn(runner);

    await expect(
      runLifecycle({
        env: {
          DATABASE_URL: "postgresql://user:pass@127.0.0.1:49152/cat",
          REDIS_URL: "redis://127.0.0.1:49153",
        },
        projectName: "cat-container-wrong-exit",
        run,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("runtime crashed");
  });
});
