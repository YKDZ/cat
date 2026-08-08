import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inspect } from "node:util";

import { describe, expect, it, vi } from "vitest";

import {
  CommandExecutionError,
  CommandStartError,
  CheckAllInterruptedError,
  parseCheckAllCommand,
  runCheckAllCli,
  runCheckAllCommand,
  signalCommandProcessTree,
  type CommandRunner,
  runCheckAll,
  type SignalSource,
} from "./check-all.ts";

const spacyImageId = `sha256:${"c".repeat(64)}`;
const readySpacyProbe = vi.fn(async () => undefined);

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
  let projectName = "";
  return vi.fn(async (command, args, options) => {
    const projectNameIndex = args.indexOf("--project-name");
    if (projectNameIndex >= 0) projectName = args[projectNameIndex + 1] ?? "";
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
      return { stderr: "", stdout: "" };
    }
    if (command === "docker" && args.includes("up")) servicesStarted = true;
    if (
      command === "docker" &&
      args[0] === "buildx" &&
      args[1] === "build" &&
      args.includes("spacy")
    ) {
      const iidfile = args[args.indexOf("--iidfile") + 1];
      if (iidfile === undefined) throw new Error("missing spaCy iidfile");
      writeFileSync(iidfile, `${spacyImageId}\n`);
      return { stderr: "", stdout: "" };
    }
    if (
      command === "docker" &&
      args.includes("images") &&
      args.includes("spacy")
    ) {
      return { stderr: "", stdout: `${spacyImageId}\n` };
    }
    if (command === "docker" && args[0] === "image" && args[1] === "inspect") {
      return { stderr: "", stdout: `${spacyImageId}\n` };
    }
    if (
      command === "docker" &&
      args[0] === "container" &&
      args[1] === "inspect" &&
      args.includes("{{json .}}")
    ) {
      return {
        stderr: "",
        stdout: JSON.stringify({
          Config: {
            Labels: {
              "cat.test-service-lease.token": options.env.CAT_E2E_LEASE_TOKEN,
              "com.docker.compose.project": projectName,
            },
          },
          Id: `probe-id-${args[2]}`,
        }),
      };
    }
    if (command === "docker" && args.includes("ps")) {
      return {
        stderr: "",
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
        return { stderr: "", stdout: "postgres\nredis\nspacy\n" };
      if (args[0] === "network") return { stderr: "", stdout: "network\n" };
      return {
        stderr: "",
        stdout: "postgres-data\nredis-data\nspacy-models\n",
      };
    }
    if (command === "docker" && args.includes("inspect")) {
      return { stderr: "", stdout: `${options.env.CAT_E2E_LEASE_TOKEN}\n` };
    }
    if (command === "docker" && args.includes("port")) {
      return {
        stderr: "",
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
    return { stderr: "", stdout: "" };
  });
};

const builtImages = {
  images: [
    { imageId: `sha256:${"a".repeat(64)}`, target: "standalone" as const },
    { imageId: `sha256:${"b".repeat(64)}`, target: "runtime" as const },
  ],
};

const discardCheckAllLog = (_message: string): void => undefined;

describe("check:all service lifecycle", () => {
  it("keeps successful schema pushes concise while preserving strict forced migration", () => {
    const drizzleConfig = readFileSync(
      resolve(import.meta.dirname, "../packages/db/drizzle.config.ts"),
      "utf8",
    );
    const packageManifest = JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, "../packages/db/package.json"),
        "utf8",
      ),
    ) as { scripts?: Record<string, string> };

    expect(drizzleConfig).toContain("verbose: false");
    expect(drizzleConfig).toContain("strict: true");
    expect(packageManifest.scripts?.["drizzle:push"]).toBe(
      "node src/prepare-database-capabilities.ts && drizzle-kit push --force && node src/prepare-vector-runtime-schema.ts",
    );
  });

  it("normalizes a real spawn failure without retaining secret arguments", async () => {
    const secret = "spawn-argument-secret";
    let failure: unknown;
    try {
      await runCheckAllCommand(
        "cat-check-all-command-that-does-not-exist",
        [
          `PGPASSWORD=${secret}`,
          `DATABASE_URL=postgresql://admin:${secret}@example.test/cat`,
        ],
        {
          cwd: process.cwd(),
          env: process.env,
          stdio: "pipe",
        },
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(CommandStartError);
    expect((failure as CommandStartError).code).toBe("ENOENT");
    const inspected = inspect(failure, { depth: Number.POSITIVE_INFINITY });
    const serialized = JSON.stringify(failure);
    expect(inspected).not.toContain(secret);
    expect(serialized).not.toContain(secret);
    expect(String(failure)).not.toContain(secret);
    expect(inspected).not.toContain("spawnargs");
    expect(serialized).not.toContain("spawnargs");
    expect(Reflect.ownKeys(Object(failure))).not.toContain("spawnargs");
  });

  it("preserves recognizable abort semantics without retaining command arguments", async () => {
    const controller = new AbortController();
    const secret = "aborted-argument-secret";
    const running = runCheckAllCommand(
      process.execPath,
      ["-e", "setInterval(() => undefined, 1000)", `PGPASSWORD=${secret}`],
      {
        cwd: process.cwd(),
        env: process.env,
        signal: controller.signal,
        stdio: "pipe",
      },
    );
    controller.abort();

    let failure: unknown;
    try {
      await running;
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).name).toBe("AbortError");
    expect(Reflect.get(Object(failure), "code")).toBe("ABORT_ERR");
    expect(inspect(failure, { depth: Number.POSITIVE_INFINITY })).not.toContain(
      secret,
    );
  });

  it("treats an already-exited POSIX process group as successfully signaled", () => {
    if (process.platform === "win32") return;
    const childKill = vi.fn(() => false);
    const processKill = vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("process group not found"), {
        code: "ESRCH",
      });
    });
    try {
      const failure = signalCommandProcessTree(
        { kill: childKill, pid: 123_456_789 } as unknown as ChildProcess,
        "SIGTERM",
      );

      expect(failure).toBeUndefined();
      expect(processKill).toHaveBeenCalledWith(-123_456_789, "SIGTERM");
      expect(childKill).not.toHaveBeenCalled();
    } finally {
      processKill.mockRestore();
    }
  });

  it("waits for an aborted command to finish cleanup before releasing its caller", async () => {
    const directory = mkdtempSync(join(tmpdir(), "cat-check-all-abort-"));
    const readyPath = join(directory, "ready");
    const cleanupPath = join(directory, "cleanup");
    const controller = new AbortController();
    try {
      const running = runCheckAllCommand(
        process.execPath,
        [
          "-e",
          `const { writeFileSync } = require("node:fs"); writeFileSync(${JSON.stringify(readyPath)}, "ready"); process.on("SIGTERM", () => setTimeout(() => { writeFileSync(${JSON.stringify(cleanupPath)}, "complete"); process.exit(0); }, 100)); setInterval(() => undefined, 1000);`,
        ],
        {
          cwd: process.cwd(),
          env: process.env,
          signal: controller.signal,
          stdio: "pipe",
        },
      );
      await vi.waitFor(() => expect(existsSync(readyPath)).toBe(true));
      controller.abort(new Error("interrupt check:all"));

      await expect(running).rejects.toThrow();
      expect(existsSync(cleanupPath)).toBe(true);
    } finally {
      await vi.waitFor(() => expect(existsSync(cleanupPath)).toBe(true));
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("waits for descendant cleanup after the direct command exits", async () => {
    const directory = mkdtempSync(join(tmpdir(), "cat-check-all-tree-abort-"));
    const readyPath = join(directory, "ready");
    const cleanupPath = join(directory, "cleanup");
    const controller = new AbortController();
    const descendant = `const { writeFileSync } = require("node:fs"); writeFileSync(process.argv[1], "ready"); process.on("SIGTERM", () => setTimeout(() => { writeFileSync(process.argv[2], "complete"); process.exit(0); }, 100)); setInterval(() => undefined, 1000);`;
    try {
      const running = runCheckAllCommand(
        process.execPath,
        [
          "-e",
          `const { spawn } = require("node:child_process"); spawn(process.execPath, ["-e", ${JSON.stringify(descendant)}, ${JSON.stringify(readyPath)}, ${JSON.stringify(cleanupPath)}], { stdio: "inherit" }); setInterval(() => undefined, 1000);`,
        ],
        {
          cwd: process.cwd(),
          env: process.env,
          signal: controller.signal,
          stdio: "pipe",
        },
      );
      await vi.waitFor(() => expect(existsSync(readyPath)).toBe(true));
      controller.abort(new Error("interrupt command tree"));

      await expect(running).rejects.toThrow();
      expect(existsSync(cleanupPath)).toBe(true);
    } finally {
      await vi.waitFor(() => expect(existsSync(cleanupPath)).toBe(true));
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("redacts failed output streams and omits secret-bearing arguments at the process boundary", async () => {
    const databaseSecret = "database-process-secret";
    const redisSecret = "redis-process-secret";
    const bootstrapSecret = "bootstrap-process-secret";
    let failure: unknown;
    try {
      await runCheckAllCommand(
        process.execPath,
        [
          "-e",
          `process.stdout.write("DATABASE_URL=postgresql://admin:${databaseSecret}@example.test/cat\\n"); process.stderr.write("REDIS_URL=redis://:${redisSecret}@example.test:6379 CAT_BOOTSTRAP_PLAN={\\"token\\":\\"${bootstrapSecret}\\"}\\n"); process.exit(7)`,
        ],
        {
          cwd: process.cwd(),
          env: process.env,
          stdio: "pipe",
        },
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(CommandExecutionError);
    const commandFailure = failure as CommandExecutionError;
    expect(commandFailure.exitCode).toBe(7);
    expect(commandFailure.stdout).toContain(
      "DATABASE_URL=postgresql://[REDACTED]@",
    );
    expect(commandFailure.stderr).toContain("REDIS_URL=redis://[REDACTED]@");
    expect(commandFailure.message).toContain("stdout:");
    expect(commandFailure.message).toContain("stderr:");
    expect(commandFailure.message).not.toContain("process.stdout.write");
    expect(commandFailure.message).not.toMatch(
      /database-process-secret|redis-process-secret|bootstrap-process-secret/,
    );
  });

  it("preserves successful structured stdout for internal consumers", async () => {
    const composeStatus = `${JSON.stringify({
      Health: "healthy",
      Service: "postgresql",
      State: "running",
      Labels:
        "com.docker.compose.service=postgresql,cat.test-service-lease.token=lease-secret",
    })}\n`;
    const successful = await runCheckAllCommand(
      process.execPath,
      ["-e", "process.stdout.write(process.env.CAT_COMPOSE_STATUS ?? '')"],
      {
        cwd: process.cwd(),
        env: { ...process.env, CAT_COMPOSE_STATUS: composeStatus },
        stdio: "pipe",
      },
    );
    expect(successful.stdout).toBe(composeStatus);
    expect(() => JSON.parse(successful.stdout)).not.toThrow();
  });

  it("expands and redacts primary and cleanup failures at the CLI boundary", async () => {
    const output: string[] = [];
    const exitCode = await runCheckAllCli({
      args: [],
      execute: async () => {
        throw new AggregateError(
          [
            new CommandExecutionError(
              "docker command failed",
              1,
              null,
              "stderr password=stderr-secret",
              "stdout token=stdout-secret",
            ),
            new Error("cleanup REDIS_URL=redis://:cleanup-secret@example.test"),
          ],
          "validation DATABASE_URL=postgresql://admin:primary-secret@example.test/cat",
        );
      },
      writeError: (message) => output.push(message),
    });

    expect(exitCode).toBe(1);
    expect(output).toHaveLength(1);
    expect(output[0]).toContain(
      "validation DATABASE_URL=postgresql://[REDACTED]@",
    );
    expect(output[0]).toContain("stdout token=[REDACTED]");
    expect(output[0]).toContain("stderr password=[REDACTED]");
    expect(output[0]).toContain("cleanup REDIS_URL=redis://[REDACTED]@");
    expect(output[0]).not.toMatch(
      /primary-secret|stdout-secret|stderr-secret|cleanup-secret/,
    );
  });

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
    const errors: string[] = [];
    const imageBuilder = vi.fn(async (context) => {
      context.reportError?.("plain Buildx history\n");
      return builtImages;
    });
    const logs: string[] = [];

    await expect(
      runCheckAll({
        applicationLifecycle,
        appPort: 49154,
        dockerHost: "172.17.0.1",
        env: {
          CAT_CHECK_ALL_POSTGRES_PASSWORD: "contract-password",
          CAT_CHECK_ALL_POSTGRES_USER: "contract_user",
          CAT_CHECK_ALL_REDIS_PASSWORD: "test-only-password",
        },
        imageBuilder,
        log: (message) => logs.push(message),
        reportError: (message) => errors.push(message),
        projectName: "cat-check-all-contract",
        run,
        signals: signalSource(),
        spacyReadyProbe: readySpacyProbe,
      }),
    ).resolves.toBeUndefined();
    expect(logs).toContain("check:all stage=check status=started");
    expect(
      logs.some((message) =>
        /^check:all stage=check status=passed duration=\d+ms$/.test(message),
      ),
    ).toBe(true);
    expect(
      logs.some((message) =>
        message.startsWith(
          `check:all images build-id=cat-check-all-contract standalone=${builtImages.images[0]?.imageId} runtime=${builtImages.images[1]?.imageId} spacy=${spacyImageId}`,
        ),
      ),
    ).toBe(true);
    expect(logs.some((message) => message.startsWith("{"))).toBe(false);
    expect(logs.join("\n")).not.toContain("plain Buildx history");
    expect(errors).toEqual(["plain Buildx history\n"]);
    expect(applicationLifecycle.mock.calls[0]?.[1]).toMatchObject({
      images: expect.arrayContaining([
        { imageId: spacyImageId, target: "spacy" },
      ]),
    });
    expect(
      logs.filter((message) => message.includes("status=passed")),
    ).toHaveLength(14);

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
        "postgresql://contract_user:contract-password@172.17.0.1:49152/postgres",
      TEST_DATABASE_URL:
        "postgresql://contract_user:contract-password@172.17.0.1:49152/postgres",
      REDIS_URL: "redis://:test-only-password@172.17.0.1:49153",
      SPACY_SERVER_URL: "http://172.17.0.1:49155",
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
          command === "pnpm" &&
          args.length === 1 &&
          args[0] === "test:compose-contract",
      ),
    ).toBe(true);
    expect(
      calls.some(
        ([command, args]) =>
          command === "pnpm" &&
          args.length === 1 &&
          args[0] === "test:image-artifact-contract",
      ),
    ).toBe(true);
    expect(
      calls.some(
        ([command, args]) =>
          command === "pnpm" && args.includes("container:check-dockerfile"),
      ),
    ).toBe(true);
    expect(
      calls.some(
        ([command, args]) =>
          command === "pnpm" && args.includes("container:check-context"),
      ),
    ).toBe(false);
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
    expect(applicationLifecycle).toHaveBeenCalledWith(expect.any(Object), {
      images: expect.arrayContaining([
        ...builtImages.images,
        { imageId: spacyImageId, target: "spacy" },
      ]),
    });
    const e2eCall = calls.find(
      ([command, args]) => command === "pnpm" && args.includes("test:e2e"),
    );
    expect(e2eCall?.[2].env).toMatchObject({
      CAT_E2E_RUNTIME_IMAGE_ID: builtImages.images[1]?.imageId,
      CAT_E2E_STANDALONE_IMAGE_ID: builtImages.images[0]?.imageId,
    });
    expect(
      JSON.parse(e2eCall?.[2].env.CAT_TEST_SERVICE_LEASE ?? "{}"),
    ).toMatchObject({ databaseCleanup: "lease-volume", version: 2 });
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

    await runCheckAll({
      applicationLifecycle: vi.fn().mockResolvedValue(undefined),
      appPort: 49154,
      dockerGateway: "172.17.0.1",
      imageBuilder: vi.fn().mockResolvedValue(builtImages),
      log: discardCheckAllLog,
      projectName: "cat-check-all-socket-client",
      run,
      signals: signalSource(),
      spacyReadyProbe: readySpacyProbe,
    });

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
        dockerHost: "172.17.0.1",
        log: discardCheckAllLog,
        projectName: "cat-check-all-failure",
        run,
        signals: signalSource(),
        spacyReadyProbe: readySpacyProbe,
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

  it("does not report image or E2E stages as passed before their release evidence validates", async () => {
    const imageLogs: string[] = [];
    await expect(
      runCheckAll({
        appPort: 49154,
        dockerHost: "172.17.0.1",
        imageBuilder: vi.fn().mockResolvedValue({
          images: [builtImages.images[0]!],
        }),
        log: (message) => imageLogs.push(message),
        projectName: "cat-check-all-missing-runtime",
        run: successfulRunner(),
        signals: signalSource(),
        spacyReadyProbe: readySpacyProbe,
      }),
    ).rejects.toThrow("every immutable release target");
    expect(
      imageLogs.some((message) =>
        /^check:all stage=image-build status=failed duration=\d+ms$/.test(
          message,
        ),
      ),
    ).toBe(true);
    expect(
      imageLogs.some((message) =>
        /^check:all stage=image-build status=passed /.test(message),
      ),
    ).toBe(false);

    const e2eLogs: string[] = [];
    const baseRun = successfulRunner();
    const run: CommandRunner = async (command, args, options) => {
      const result = await baseRun(command, args, options);
      if (command === "pnpm" && args.includes("test:e2e")) {
        writeFileSync(
          options.env.CAT_E2E_ATTESTATION_PATH!,
          JSON.stringify({ cells: [], releaseImages: {} }),
        );
      }
      return result;
    };
    await expect(
      runCheckAll({
        appPort: 49154,
        dockerHost: "172.17.0.1",
        imageBuilder: vi.fn().mockResolvedValue(builtImages),
        log: (message) => e2eLogs.push(message),
        projectName: "cat-check-all-invalid-attestation",
        run,
        signals: signalSource(),
        spacyReadyProbe: readySpacyProbe,
      }),
    ).rejects.toThrow("does not match the built images");
    expect(
      e2eLogs.some((message) =>
        /^check:all stage=e2e status=failed duration=\d+ms$/.test(message),
      ),
    ).toBe(true);
    expect(
      e2eLogs.some((message) =>
        /^check:all stage=e2e status=passed /.test(message),
      ),
    ).toBe(false);
  });

  it.each(["SIGINT", "SIGTERM"] as const)(
    "waits for cleanup after %s",
    async (signal) => {
      const signals = signalSource();
      const cleanupObserved = vi.fn();
      let cleanupSignal: AbortSignal | undefined;
      const run = successfulRunner();
      const successful = successfulRunner();
      vi.mocked(run).mockImplementation(async (command, args, options) => {
        if (command === "pnpm" && args.includes("test:integration")) {
          signals.emit(signal);
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
          dockerHost: "172.17.0.1",
          log: discardCheckAllLog,
          projectName: "cat-check-all-signal",
          run,
          signals,
          spacyReadyProbe: readySpacyProbe,
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
    },
  );

  it.each([
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const)(
    "preserves a lease cleanup failure while returning the %s exit code",
    async (signal, expectedExitCode) => {
      const signals = signalSource();
      const run = successfulRunner();
      const successful = successfulRunner();
      vi.mocked(run).mockImplementation(async (command, args, options) => {
        if (command === "pnpm" && args.includes("test:integration")) {
          signals.emit(signal);
          const abortError = new Error("The operation was aborted");
          abortError.name = "AbortError";
          throw abortError;
        }
        if (command === "docker" && args.includes("down")) {
          throw new Error("compose down cleanup failed");
        }
        return await successful(command, args, options);
      });

      let failure: unknown;
      try {
        await runCheckAll({
          appPort: 49154,
          dockerHost: "172.17.0.1",
          log: discardCheckAllLog,
          projectName: "cat-check-all-signal-cleanup-failure",
          run,
          signals,
          spacyReadyProbe: readySpacyProbe,
        });
      } catch (error) {
        failure = error;
      }

      expect(failure).toBeInstanceOf(CheckAllInterruptedError);
      if (!(failure instanceof CheckAllInterruptedError)) {
        throw new Error("Expected check:all interruption failure");
      }
      expect(failure.signal).toBe(signal);
      expect(failure.cause).toBeInstanceOf(AggregateError);

      const output: string[] = [];
      const exitCode = await runCheckAllCli({
        args: [],
        execute: async () => {
          throw failure;
        },
        writeError: (message) => output.push(message),
      });
      expect(exitCode).toBe(expectedExitCode);
      expect(output).toHaveLength(1);
      expect(output[0]).toContain("compose down cleanup failed");
    },
  );
});
