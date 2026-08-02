import { readFileSync, rmSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  exportValidatedImages,
  runApplicationLifecycle,
} from "./check-all-containers.ts";
import { CommandExecutionError, type CommandRunner } from "./check-all.ts";

const standaloneImageId = `sha256:${"a".repeat(64)}`;
const runtimeImageId = `sha256:${"b".repeat(64)}`;
const spacyImageId = `sha256:${"c".repeat(64)}`;
const releaseImages = {
  images: [
    { imageId: standaloneImageId, target: "standalone" as const },
    { imageId: runtimeImageId, target: "runtime" as const },
    { imageId: spacyImageId, target: "spacy" as const },
  ],
};

const runLifecycle = async (
  context: Parameters<typeof runApplicationLifecycle>[0],
): Promise<void> => {
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
};

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
      if (args.includes(spacyImageId)) {
        return {
          stderr: "",
          stdout: JSON.stringify({
            Cmd: ["provision-and-serve"],
            Entrypoint: ["python", "-m", "src.cli"],
            Healthcheck: {
              Test: ["CMD-SHELL", "python -c http://127.0.0.1:8000/ready"],
            },
            Labels: {
              "org.opencontainers.image.version":
                releaseImageBuildId ?? buildId,
            },
            User: "10001:10001",
            Volumes: { "/models": {} },
          }),
        };
      }
      const mode = args.includes(standaloneImageId) ? "standalone" : "runtime";
      return {
        stderr: "",
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
      return { stderr: "", stdout: "healthy\n" };
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
    return { stderr: "", stdout: "" };
  };
  return vi.fn(runner);
};

describe("application container lifecycle", () => {
  it("validates supplied images against an explicit release build ID", async () => {
    const run = lifecycleRunner(undefined, "release-identity");
    const reportError = vi.fn();
    await runLifecycle({
      buildId: "release-identity",
      env: {
        DATABASE_URL: "postgresql://user:pass@127.0.0.1:49152/cat",
        REDIS_URL: "redis://127.0.0.1:49153",
      },
      projectName: "cat-container-explicit-build-id",
      reportError,
      run,
      signal: new AbortController().signal,
    });
    expect(reportError).not.toHaveBeenCalled();
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
    expect(calls.find((args) => args[0] === "build")).toContain(
      "--progress=quiet",
    );
    expect(
      vi
        .mocked(run)
        .mock.calls.every(([, , options]) => options.stdio === "pipe"),
    ).toBe(true);
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
    expect(createIndex).toBeGreaterThan(-1);
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
    expect(createIndex).toBeLessThan(calls.indexOf(secondPreparation));
    expect(calls.indexOf(secondPreparation)).toBeLessThan(
      calls.indexOf(standaloneBootstrap),
    );
    expect(dropIndex).toBeGreaterThan(calls.indexOf(secondPreparation));

    const firstPreparation = standalonePreparations[0];
    if (firstPreparation === undefined) {
      throw new Error("Expected a first standalone preparation");
    }
    const databaseUrl = firstPreparation.find((arg) =>
      arg.startsWith("DATABASE_URL="),
    );
    expect(databaseUrl).toMatch(
      /^DATABASE_URL=postgresql:\/\/user:pass@postgresql:5432\/cat_lifecycle_[a-f0-9]{32}$/,
    );
    expect(databaseUrl).not.toContain("cat_integration");
  });

  it("leaves database capability mutation to the standalone preparation command", () => {
    const preparationSource = readFileSync(
      "apps/app/scripts/prepare-database.mjs",
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

    expect(preparationSource).toContain(
      "CREATE EXTENSION IF NOT EXISTS vector",
    );
    expect(preparationSource).toContain(
      "CREATE EXTENSION IF NOT EXISTS pg_trgm",
    );
    expect(preparationSource).toContain("assertDatabaseRequirements");
    expect(lifecycleSource).not.toContain("CREATE EXTENSION");
    expect(executionCellSource).not.toContain("CREATE EXTENSION");
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
    const standaloneAggregate = calls.find(
      (args) =>
        args[0] === "run" &&
        args.includes("prepare-and-start") &&
        args.includes(standaloneImageId),
    );
    if (standaloneAggregate === undefined) {
      throw new Error("Expected standalone prepare-and-start command");
    }
    expect(standaloneAggregate).toEqual(
      expect.arrayContaining(["--env", plan!]),
    );
    expect(
      standaloneAggregate.find((argument) =>
        argument.startsWith("CAT_BOOTSTRAP_PLAN="),
      ),
    ).toBe(plan);
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
            pluginId: "spacy-language-analyzer",
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
    const run = vi.fn<CommandRunner>(async (command, args, options) => {
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
    const run = vi.fn<CommandRunner>(async (command, args, options) => {
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

  it("replays container diagnostics before cleanup when a server fails readiness", async () => {
    const baseRun = lifecycleRunner();
    const run = vi.fn<CommandRunner>(async (command, args, options) => {
      if (args.includes("{{.State.Health.Status}}")) {
        return { stderr: "", stdout: "unhealthy\n" };
      }
      if (args[0] === "logs") {
        return {
          stderr: "sidecar password=diagnostic-secret\n",
          stdout: "application startup failure\n",
        };
      }
      return await baseRun(command, args, options);
    });
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    try {
      await expect(
        runLifecycle({
          env: {
            DATABASE_URL: "postgresql://user:pass@127.0.0.1:49152/cat",
            REDIS_URL: "redis://127.0.0.1:49153",
          },
          projectName: "cat-container-diagnostics",
          run,
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow("became unhealthy");

      const calls = vi.mocked(run).mock.calls.map(([, args]) => args);
      const container = "cat-container-diagnostics-standalone";
      const logsIndex = calls.findIndex(
        (args) => args[0] === "logs" && args.includes(container),
      );
      const inspectIndex = calls.findIndex(
        (args) =>
          args[0] === "inspect" &&
          args.includes(container) &&
          args.includes(
            "status={{.State.Status}} exit-code={{.State.ExitCode}} oom-killed={{.State.OOMKilled}} error={{.State.Error}}",
          ),
      );
      const cleanupIndex = calls.findIndex(
        (args) => args[0] === "rm" && args.includes(container),
      );
      expect(logsIndex).toBeGreaterThan(-1);
      expect(inspectIndex).toBeGreaterThan(logsIndex);
      expect(cleanupIndex).toBeGreaterThan(inspectIndex);
      const logsCall = vi.mocked(run).mock.calls[logsIndex];
      expect(logsCall?.[2].stdio).toBe("pipe");
      expect(stderr).toHaveBeenCalledWith("application startup failure\n");
      expect(stderr).toHaveBeenCalledWith("sidecar password=[REDACTED]\n");
      expect(stderr).not.toHaveBeenCalledWith(
        expect.stringContaining("diagnostic-secret"),
      );
      expect(stdout).not.toHaveBeenCalledWith("application startup failure\n");
      expect(stderr).toHaveBeenCalledWith(
        expect.stringContaining(
          `container lifecycle cleanup container=${container} result=passed`,
        ),
      );
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }
  });

  it("preserves the primary lifecycle failure alongside storage, database, and temporary-image cleanup failures", async () => {
    const baseRun = lifecycleRunner();
    const run = vi.fn<CommandRunner>(async (command, args, options) => {
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
    const run = vi.fn<CommandRunner>(async (command, args, options) => {
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

  it("exports all images only after the separate lifecycle stage passes", async () => {
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
        [
          "image",
          "save",
          "--output",
          `${exportDirectory}/spacy.tar`,
          spacyImageId,
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
          spacy: {
            identity: {
              command: "provision-and-serve",
              description: "CAT spaCy language analysis runtime",
              versionLabel: "cat-container-export",
            },
            imageId: spacyImageId,
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
    const errors: string[] = [];
    let cleanupSignal: AbortSignal | undefined;
    const baseRun = lifecycleRunner((args, signal) => {
      if (args.includes("{{.State.Health.Status}}")) controller.abort();
      if (args[0] === "rm" && args.includes("--force")) cleanupSignal = signal;
    });
    const run: CommandRunner = async (command, args, options) => {
      if (args[0] === "logs") {
        return { stderr: "", stdout: "application startup failed\n" };
      }
      if (
        args.some((argument) => argument.startsWith("status={{.State.Status}}"))
      ) {
        return { stderr: "", stdout: "status=exited exit-code=1\n" };
      }
      return await baseRun(command, args, options);
    };

    await expect(
      runLifecycle({
        env: {
          DATABASE_URL: "postgresql://user:pass@127.0.0.1:49152/cat",
          REDIS_URL: "redis://127.0.0.1:49153",
        },
        projectName: "cat-container-abort",
        reportError: (message) => errors.push(message),
        run,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(controller.signal.aborted).toBe(true);
    expect(cleanupSignal).toBeDefined();
    expect(cleanupSignal).not.toBe(controller.signal);
    expect(cleanupSignal?.aborted).toBe(false);
    expect(errors.join("")).toContain(
      "container lifecycle failure container=cat-container-abort-standalone",
    );
    expect(errors.join("")).toContain("application startup failed");
    expect(errors.join("")).toContain("status=exited exit-code=1");
    expect(errors.join("")).toContain(
      "container lifecycle cleanup container=cat-container-abort-standalone result=passed",
    );
  });

  it("accepts only exit code 64 as runtime preparation rejection", async () => {
    const baseRun = lifecycleRunner();
    const runner: CommandRunner = async (command, args, options) => {
      if (args.includes("prepare-only") && args.includes(runtimeImageId)) {
        throw new CommandExecutionError(
          "runtime crashed",
          1,
          null,
          "docker stderr password=stderr-secret",
          "docker stdout token=stdout-secret",
        );
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
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(CommandExecutionError);
      expect(String(error)).toContain("docker stderr password=[REDACTED]");
      expect(String(error)).toContain("docker stdout token=[REDACTED]");
      expect(String(error)).not.toMatch(/stderr-secret|stdout-secret/);
      return true;
    });
  });
});
