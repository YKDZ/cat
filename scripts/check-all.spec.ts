import { EventEmitter } from "node:events";
import { writeFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  CheckAllInterruptedError,
  parseCheckAllCommand,
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

const successfulRunner = (): CommandRunner => {
  let servicesStarted = false;
  return vi.fn(async (command, args, options) => {
    if (command === "pnpm" && args.includes("test:e2e")) {
      const path = options.env.CAT_E2E_ATTESTATION_PATH;
      if (path === undefined) throw new Error("missing E2E attestation path");
      writeFileSync(
        path,
        JSON.stringify({
          cells: [
            { browser: "chromium", target: "dev" },
            {
              browser: "chromium",
              imageId: options.env.CAT_E2E_STANDALONE_IMAGE_ID,
              target: "standalone",
            },
            {
              browser: "firefox",
              imageId: options.env.CAT_E2E_STANDALONE_IMAGE_ID,
              target: "standalone",
            },
            {
              browser: "chromium",
              imageId: options.env.CAT_E2E_RUNTIME_IMAGE_ID,
              preparerImageId: options.env.CAT_E2E_STANDALONE_IMAGE_ID,
              target: "runtime",
            },
            {
              browser: "firefox",
              imageId: options.env.CAT_E2E_RUNTIME_IMAGE_ID,
              preparerImageId: options.env.CAT_E2E_STANDALONE_IMAGE_ID,
              target: "runtime",
            },
          ],
          releaseImages: {
            releaseIdentity: options.env.CAT_CHECK_ALL_BUILD_ID,
            runtimeImageId: options.env.CAT_E2E_RUNTIME_IMAGE_ID,
            standaloneImageId: options.env.CAT_E2E_STANDALONE_IMAGE_ID,
          },
        }),
      );
      return { stdout: "" };
    }
    if (command === "docker" && args.includes("up")) servicesStarted = true;
    if (command === "docker" && args.includes("ps")) {
      return {
        stdout: servicesStarted
          ? JSON.stringify([
              { Service: "postgresql", State: "running", Health: "healthy" },
              { Service: "redis", State: "running", Health: "healthy" },
              { Service: "spacy", State: "running", Health: "healthy" },
            ])
          : "",
      };
    }
    if (command === "docker" && args.includes("ls")) {
      if (args[0] === "container")
        return { stdout: "postgres\nredis\nspacy\n" };
      if (args[0] === "network") return { stdout: "network\n" };
      return { stdout: "postgres-data\nredis-data\n" };
    }
    if (command === "docker" && args.includes("inspect")) {
      return { stdout: `${options.env.CAT_E2E_LEASE_TOKEN}\n` };
    }
    if (command === "docker" && args.includes("port")) {
      return {
        stdout: args.includes("postgresql")
          ? "0.0.0.0:49152\n"
          : args.includes("redis")
            ? "0.0.0.0:49153\n"
            : "0.0.0.0:49155\n",
      };
    }
    if (options.signal !== undefined) {
      expect(options.signal.aborted).toBe(false);
    }
    return { stdout: "" };
  });
};

const builtImages = {
  images: [
    { imageId: `sha256:${"a".repeat(64)}`, target: "standalone" as const },
    { imageId: `sha256:${"b".repeat(64)}`, target: "runtime" as const },
  ],
};

describe("check:all service lifecycle", () => {
  it("accepts fixed release identities and explicit E2E concurrency", () => {
    expect(
      parseCheckAllCommand([
        "--build-id",
        "release-identity",
        "--e2e-concurrency",
        "1",
      ]),
    ).toEqual({ buildId: "release-identity", e2eConcurrency: 1 });
    expect(() => parseCheckAllCommand(["--e2e-concurrency", "3"])).toThrow(
      "Usage:",
    );
    expect(() => parseCheckAllCommand(["--build-id", ""])).toThrow(
      "must not be empty",
    );
  });

  it("uses one injected lease from the canonical E2E service template", async () => {
    const run = successfulRunner();
    const applicationLifecycle = vi.fn().mockResolvedValue(undefined);
    const imageBuilder = vi.fn().mockResolvedValue(builtImages);

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
      imageBuilder,
      projectName: "cat-check-all-contract",
      run,
      signals: signalSource(),
    });

    expect(report.projectName).toBe("cat-check-all-contract");
    expect(report.databaseUrl).toBe(
      "postgresql://contract_user:contract-password@127.0.0.1:49152/postgres",
    );
    expect(report.redisUrl).toBe("redis://:test-only-password@127.0.0.1:49153");
    expect(report.images).toMatchObject({
      buildId: "cat-check-all-contract",
      e2eAttestedImageIds: {
        runtime: builtImages.images[1]?.imageId,
        standalone: builtImages.images[0]?.imageId,
      },
      e2eAttestation: { cells: expect.any(Array) },
      lifecycleValidatedImageIds: {
        runtime: builtImages.images[1]?.imageId,
        standalone: builtImages.images[0]?.imageId,
      },
      releaseIdentity: "cat-check-all-contract",
      targetImageIds: {
        runtime: builtImages.images[1]?.imageId,
        standalone: builtImages.images[0]?.imageId,
      },
    });
    expect(report.images.e2eAttestation.cells).toHaveLength(5);
    expect(report.stages.map((stage) => stage.name)).toEqual([
      "check",
      "database",
      "integration",
      "compose-contract",
      "pglite",
      "build",
      "image-build",
      "e2e",
      "container-lifecycle",
      "image-artifact",
      "image-artifact-contract",
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
          expect.stringMatching(/^cat-e2e-\d+-[a-f\d]{32}$/),
          "--file",
          expect.stringContaining("apps/app-e2e/compose.e2e.yaml"),
        ]),
      );
      expect(options.env.CAT_E2E_POSTGRES_HOST_PORT).toBe("0");
    }
    const integrationCall = calls.find(
      ([command, args]) =>
        command === "pnpm" && args.includes("test:integration"),
    );
    expect(integrationCall?.[2].env).toMatchObject({
      DATABASE_URL:
        "postgresql://contract_user:contract-password@127.0.0.1:49152/postgres",
      TEST_DATABASE_URL:
        "postgresql://contract_user:contract-password@127.0.0.1:49152/postgres",
      REDIS_URL: "redis://:test-only-password@127.0.0.1:49153",
      SPACY_SERVER_URL: "http://127.0.0.1:49155",
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
    expect(imageBuilder).toHaveBeenCalledOnce();
    expect(applicationLifecycle).toHaveBeenCalledWith(
      expect.any(Object),
      builtImages,
    );
    const e2eCall = calls.find(
      ([command, args]) => command === "pnpm" && args.includes("test:e2e"),
    );
    expect(e2eCall?.[2].env).toMatchObject({
      CAT_E2E_RUNTIME_IMAGE_ID: builtImages.images[1]?.imageId,
      CAT_E2E_STANDALONE_IMAGE_ID: builtImages.images[0]?.imageId,
    });
    expect(e2eCall?.[1]).toEqual(
      expect.arrayContaining(["--concurrency", "2"]),
    );
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
      applicationLifecycle: vi.fn().mockResolvedValue(undefined),
      appPort: 49154,
      dockerGateway: "172.17.0.1",
      imageBuilder: vi.fn().mockResolvedValue(builtImages),
      projectName: "cat-check-all-socket-client",
      run,
      signals: signalSource(),
    });

    expect(report.databaseUrl).toContain("@172.17.0.1:49152/");
    expect(new URL(report.databaseUrl).pathname).toBe("/postgres");
    expect(report.redisUrl).toContain("@172.17.0.1:49153");
    const composeUpCall = vi
      .mocked(run)
      .mock.calls.find(
        ([command, args]) =>
          command === "docker" &&
          args.includes("up") &&
          args.includes("--detach"),
      );
    expect(composeUpCall?.[2].env.CAT_E2E_POSTGRES_HOST_PORT).toBe("0");
    expect(composeUpCall?.[2].env.CAT_E2E_BIND_HOST).toBe("172.17.0.1");
  });

  it("cleans up its compose project when a stage fails", async () => {
    const run = successfulRunner();
    const successful = successfulRunner();
    vi.mocked(run).mockImplementation(async (command, args, commandOptions) => {
      if (command === "pnpm" && args.includes("test:integration")) {
        throw new Error("integration failed");
      }
      return await successful(command, args, commandOptions);
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
    const successful = successfulRunner();
    vi.mocked(run).mockImplementation(async (command, args, options) => {
      if (command === "pnpm" && args.includes("test:integration")) {
        signals.emit("SIGTERM");
        const abortError = new Error("The operation was aborted");
        abortError.name = "AbortError";
        throw abortError;
      }
      if (command === "docker" && args.includes("down")) {
        cleanupObserved();
        cleanupSignal = options.signal;
      }
      return await successful(command, args, options);
    });

    await expect(
      runCheckAll({
        appPort: 49154,
        dockerHost: "127.0.0.1",
        projectName: "cat-check-all-signal",
        run,
        signals,
      }),
    ).rejects.toBeInstanceOf(CheckAllInterruptedError);
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
