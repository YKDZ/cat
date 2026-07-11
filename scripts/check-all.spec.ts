import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  type CommandRunner,
  runCheckAll,
  type SignalSource,
} from "./check-all.ts";

type TestSignalSource = SignalSource & {
  emit(signal: "SIGINT" | "SIGTERM"): boolean;
};

const signalSource = (): TestSignalSource => {
  const emitter = new EventEmitter();
  return {
    emit: (signal) => emitter.emit(signal),
    off: (signal, listener) => emitter.off(signal, listener),
    on: (signal, listener) => emitter.on(signal, listener),
  };
};

const successfulRunner = (): CommandRunner =>
  vi.fn(async (command, args, options) => {
    if (command === "docker" && args.includes("port")) {
      return {
        stdout: args.includes("postgresql")
          ? "0.0.0.0:49152\n"
          : "0.0.0.0:49153\n",
      };
    }
    if (options.signal !== undefined) {
      expect(options.signal.aborted).toBe(false);
    }
    return { stdout: "" };
  });

describe("check:all service lifecycle", () => {
  it("publishes isolated service ports on the loopback interface by default", () => {
    const compose = readFileSync(
      resolve(import.meta.dirname, "check-all.compose.yml"),
      "utf8",
    );

    const wildcardHost = ["0", "0", "0", "0"].join(".");
    expect(compose).toContain("${CAT_CHECK_ALL_BIND_HOST:-127.0.0.1}:0:5432");
    expect(compose).toContain("${CAT_CHECK_ALL_BIND_HOST:-127.0.0.1}:0:6379");
    expect(compose).not.toContain(wildcardHost);
  });

  it("uses one isolated compose project and injects discovered service URLs", async () => {
    const run = successfulRunner();
    const applicationLifecycle = vi.fn().mockResolvedValue(undefined);

    const report = await runCheckAll({
      applicationLifecycle,
      appPort: 49154,
      dockerHost: "127.0.0.1",
      env: {
        CAT_CHECK_ALL_POSTGRES_DB: "cat_contract_db",
        CAT_CHECK_ALL_POSTGRES_PASSWORD: "contract-password",
        CAT_CHECK_ALL_POSTGRES_USER: "contract_user",
        CAT_CHECK_ALL_REDIS_PASSWORD: "test-only-password",
      },
      projectName: "cat-check-all-contract",
      run,
      signals: signalSource(),
    });

    expect(report.projectName).toBe("cat-check-all-contract");
    expect(report.databaseUrl).toBe(
      "postgresql://contract_user:contract-password@127.0.0.1:49152/cat_contract_db",
    );
    expect(report.redisUrl).toBe("redis://:test-only-password@127.0.0.1:49153");
    expect(report.stages.map((stage) => stage.name)).toEqual([
      "check",
      "database",
      "integration",
      "pglite",
      "e2e",
      "build",
      "artifacts",
    ]);

    const calls = vi.mocked(run).mock.calls;
    const composeCalls = calls.filter(
      ([command, args]) => command === "docker" && args[0] === "compose",
    );
    for (const [, args, options] of composeCalls) {
      expect(args).toEqual(
        expect.arrayContaining([
          "compose",
          "--project-name",
          "cat-check-all-contract",
          "--file",
          expect.stringContaining("scripts/check-all.compose.yml"),
        ]),
      );
      expect(options.env.CAT_CHECK_ALL_BIND_HOST).toBe("127.0.0.1");
    }
    const integrationCall = calls.find(
      ([command, args]) =>
        command === "pnpm" && args.includes("test:integration"),
    );
    expect(integrationCall?.[2].env).toMatchObject({
      DATABASE_URL:
        "postgresql://contract_user:contract-password@127.0.0.1:49152/cat_contract_db",
      TEST_DATABASE_URL:
        "postgresql://contract_user:contract-password@127.0.0.1:49152/cat_contract_db",
      REDIS_URL: "redis://:test-only-password@127.0.0.1:49153",
      PORT: "49154",
    });
    expect(
      calls.some(
        ([command, args]) =>
          command === "pnpm" && args.includes("test:artifacts:verify"),
      ),
    ).toBe(true);
    expect(
      calls.some(
        ([command, args]) =>
          command === "pnpm" && args.includes("test:artifacts"),
      ),
    ).toBe(false);
    const databaseIndex = calls.findIndex(
      ([command, args]) => command === "pnpm" && args.includes("drizzle:push"),
    );
    const integrationIndex = calls.findIndex(
      ([command, args]) =>
        command === "pnpm" && args.includes("test:integration"),
    );
    expect(databaseIndex).toBeGreaterThan(-1);
    expect(databaseIndex).toBeLessThan(integrationIndex);
    expect(applicationLifecycle).toHaveBeenCalledOnce();
    expect(calls.at(-1)?.[1]).toEqual(
      expect.arrayContaining([
        "down",
        "--volumes",
        "--remove-orphans",
        "--timeout",
        "15",
      ]),
    );
  });

  it("binds and reaches services through the Docker gateway for socket clients", async () => {
    const run = successfulRunner();

    const report = await runCheckAll({
      appPort: 49154,
      dockerGateway: "172.17.0.1",
      projectName: "cat-check-all-socket-client",
      run,
      signals: signalSource(),
    });

    expect(report.databaseUrl).toContain("@172.17.0.1:49152/");
    expect(new URL(report.databaseUrl).pathname).toMatch(/^\/cat_test_/);
    expect(report.redisUrl).toContain("@172.17.0.1:49153");
    const composeUpCall = vi
      .mocked(run)
      .mock.calls.find(
        ([command, args]) =>
          command === "docker" &&
          args.includes("up") &&
          args.includes("--detach"),
      );
    expect(composeUpCall?.[2].env.CAT_CHECK_ALL_BIND_HOST).toBe("172.17.0.1");
  });

  it("cleans up its compose project when a stage fails", async () => {
    const run = successfulRunner();
    vi.mocked(run).mockImplementation(async (command, args) => {
      if (command === "docker" && args.includes("port")) {
        return {
          stdout: args.includes("postgresql")
            ? "0.0.0.0:49152\n"
            : "0.0.0.0:49153\n",
        };
      }
      if (command === "pnpm" && args.includes("test:integration")) {
        throw new Error("integration failed");
      }
      return { stdout: "" };
    });

    await expect(
      runCheckAll({
        appPort: 49154,
        dockerHost: "127.0.0.1",
        projectName: "cat-check-all-failure",
        run,
        signals: signalSource(),
      }),
    ).rejects.toThrow("integration failed");

    expect(vi.mocked(run).mock.calls.at(-1)?.[1]).toEqual(
      expect.arrayContaining(["down", "--volumes", "--remove-orphans"]),
    );
    expect(
      vi
        .mocked(run)
        .mock.calls.some(
          ([command, args]) => command === "pnpm" && args.includes("test:e2e"),
        ),
    ).toBe(false);
  });

  it("waits for cleanup after a termination signal", async () => {
    const signals = signalSource();
    const cleanupObserved = vi.fn();
    let cleanupSignal: AbortSignal | undefined;
    const run = successfulRunner();
    vi.mocked(run).mockImplementation(async (command, args, options) => {
      if (command === "docker" && args.includes("port")) {
        return {
          stdout: args.includes("postgresql")
            ? "0.0.0.0:49152\n"
            : "0.0.0.0:49153\n",
        };
      }
      if (command === "pnpm" && args.includes("test:integration")) {
        signals.emit("SIGTERM");
      }
      if (command === "docker" && args.includes("down")) {
        cleanupObserved();
        cleanupSignal = options.signal;
      }
      return { stdout: "" };
    });

    await expect(
      runCheckAll({
        appPort: 49154,
        dockerHost: "127.0.0.1",
        projectName: "cat-check-all-signal",
        run,
        signals,
      }),
    ).rejects.toThrow("SIGTERM");
    expect(cleanupObserved).toHaveBeenCalledOnce();
    expect(cleanupSignal).toBeDefined();
    expect(cleanupSignal?.aborted).toBe(false);
    const cleanupCall = vi
      .mocked(run)
      .mock.calls.find(
        ([command, args]) => command === "docker" && args.includes("down"),
      );
    expect(cleanupCall?.[1]).toEqual(
      expect.arrayContaining(["--timeout", "15"]),
    );
  });
});
