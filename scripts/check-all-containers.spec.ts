import { describe, expect, it, vi } from "vitest";

import { runApplicationLifecycle } from "./check-all-containers.ts";
import { CommandExecutionError, type CommandRunner } from "./check-all.ts";

const lifecycleRunner = (
  onCall?: (args: string[], signal: AbortSignal | undefined) => void,
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
      const mode = args.some((arg) => arg.endsWith(":standalone"))
        ? "standalone"
        : "runtime";
      return {
        stdout: JSON.stringify({
          Cmd: [mode === "standalone" ? "prepare-and-start" : "start-only"],
          Entrypoint: ["/usr/local/bin/container-entrypoint"],
          Healthcheck: {
            Test: ["CMD-SHELL", "node /usr/local/bin/docker-health-check.js"],
          },
          Labels: {
            "org.opencontainers.image.version": buildId,
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
      args.includes("prepare-only") &&
      args.some((arg) => arg.endsWith(":runtime"))
    ) {
      throw new CommandExecutionError("runtime rejected preparation", 64, null);
    }
    return { stdout: "" };
  };
  return vi.fn(runner);
};

describe("application container lifecycle", () => {
  it("builds the context contract and both explicit modes, then verifies their observable image contract", async () => {
    const run = lifecycleRunner();
    await runApplicationLifecycle({
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
    expect(buildTargets).toEqual(["context-contract", "standalone", "runtime"]);
    expect(
      calls
        .filter((args) => args[0] === "build")
        .map((args) =>
          args.find((arg) => arg.startsWith("DEPLOYMENT_BUILD_ID=")),
        ),
    ).toEqual([
      "DEPLOYMENT_BUILD_ID=cat-container-contract",
      "DEPLOYMENT_BUILD_ID=cat-container-contract",
      "DEPLOYMENT_BUILD_ID=cat-container-contract",
    ]);
    expect(
      calls.some(
        (args) => args.includes("--entrypoint") && args.includes("/bin/sh"),
      ),
    ).toBe(true);
    expect(calls.at(-1)).toEqual(
      expect.arrayContaining(["image", "rm", "--force"]),
    );
  });

  it("prepares a fresh lifecycle database twice before runtime starts, then removes it", async () => {
    const run = lifecycleRunner();
    await runApplicationLifecycle({
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
        args.some((arg) => arg.endsWith(":standalone")),
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
    const secondPreparation = standalonePreparations.at(1);
    if (secondPreparation === undefined) {
      throw new Error("Expected two standalone preparations");
    }
    expect(searchRuntimeSetupIndex).toBeLessThan(
      calls.indexOf(secondPreparation),
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

    await runApplicationLifecycle({
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

    await runApplicationLifecycle({
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
      runApplicationLifecycle({
        env: {
          DATABASE_URL: "postgresql://user:pass@127.0.0.1:49152/cat",
          REDIS_URL: "redis://127.0.0.1:49153",
        },
        projectName: "cat-container-drop-error",
        run,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("drop failed");
  });

  it("removes the lifecycle database when preparation fails", async () => {
    const baseRun = lifecycleRunner();
    let standalonePreparations = 0;
    const run = vi.fn(async (command, args, options) => {
      if (
        args.includes("prepare-only") &&
        args.some((arg) => arg.endsWith(":standalone"))
      ) {
        standalonePreparations += 1;
        if (standalonePreparations === 2) {
          throw new CommandExecutionError("second preparation failed", 1, null);
        }
      }
      return await baseRun(command, args, options);
    });

    await expect(
      runApplicationLifecycle({
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
  });

  it("exports both images only after their lifecycle assertions pass", async () => {
    const run = lifecycleRunner();
    await runApplicationLifecycle({
      env: {
        CAT_CHECK_ALL_EXPORT_IMAGES_DIR: "/tmp/cat-validated-images",
        DATABASE_URL: "postgresql://user:pass@127.0.0.1:49152/cat",
        REDIS_URL: "redis://127.0.0.1:49153",
      },
      projectName: "cat-container-export",
      run,
      signal: new AbortController().signal,
    });

    const calls = vi.mocked(run).mock.calls.map(([, args]) => args);
    const saves = calls.filter(
      (args) => args[0] === "image" && args[1] === "save",
    );
    expect(saves).toEqual([
      [
        "image",
        "save",
        "--output",
        "/tmp/cat-validated-images/standalone.tar",
        "cat-container-export-app:standalone",
      ],
      [
        "image",
        "save",
        "--output",
        "/tmp/cat-validated-images/runtime.tar",
        "cat-container-export-app:runtime",
      ],
    ]);
    const firstSave = saves.at(0);
    if (firstSave === undefined) throw new Error("Expected standalone export");
    expect(calls.indexOf(firstSave)).toBeGreaterThan(
      calls.findIndex(
        (args) =>
          args.includes("prepare-only") &&
          args.some((arg) => arg.endsWith(":runtime")),
      ),
    );
  });

  it("uses a fresh bounded signal to remove a server after the lifecycle is aborted", async () => {
    const controller = new AbortController();
    let cleanupSignal: AbortSignal | undefined;
    const run = lifecycleRunner((args, signal) => {
      if (args.includes("{{.State.Health.Status}}")) controller.abort();
      if (args[0] === "rm" && args.includes("--force")) cleanupSignal = signal;
    });

    await expect(
      runApplicationLifecycle({
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
      if (
        args.includes("prepare-only") &&
        args.some((arg) => arg.endsWith(":runtime"))
      ) {
        throw new CommandExecutionError("runtime crashed", 1, null);
      }
      return await baseRun(command, args, options);
    };
    const run = vi.fn(runner);

    await expect(
      runApplicationLifecycle({
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
