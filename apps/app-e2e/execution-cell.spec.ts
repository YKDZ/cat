import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  ExecutionCell,
  DevTargetAdapter,
  developmentRuntimeEnvironment,
  formatDockerContainerPhaseFailure,
  isServerErrorDiagnostic,
  processIdentityMatches,
  runAbortableCommand,
  runExecutionCells,
  type CellRuntime,
  type ExecutionCellInput,
  type StartedProcess,
  type TargetAdapter,
} from "./execution-cell.ts";

const input = {
  browser: "chromium",
  lease: {} as ExecutionCellInput["lease"],
  target: "dev",
} satisfies ExecutionCellInput;

const createTestRuntime = (
  overrides: Partial<CellRuntime> = {},
): CellRuntime => ({
  applicationBindHost: "127.0.0.1",
  applicationPort: 3000,
  applicationUrl: "http://127.0.0.1:3000",
  artifactDirectory: "/tmp/cat-e2e-artifacts",
  baseUrl: "http://127.0.0.1:3000",
  databaseName: "cat_e2e",
  databaseUrl: "postgresql://localhost/cat_e2e",
  environment: {},
  port: 3000,
  probeWorkspace: {
    applicationSourcePath: "/tmp/application-probe.vue",
    cacheDirectory: "/tmp/vite-cache",
    directory: "/tmp/probe",
    privateJitPackageRoot: "/tmp/private-jit",
    privateJitSourcePath: "/tmp/private-jit/probe.vue",
  },
  redisNamespace: "cat-e2e:test",
  refsPath: "/tmp/refs.json",
  serviceNetworkName: "cat-e2e-test_default",
  storageDirectory: "/tmp/storage",
  ...overrides,
});

describe("ExecutionCell scheduler", () => {
  it("terminates an active child process when its execution signal aborts", async () => {
    const controller = new AbortController();
    const child = new EventEmitter() as EventEmitter & {
      kill: ReturnType<typeof vi.fn>;
      stderr: undefined;
      stdout: undefined;
    };
    child.kill = vi.fn(() => {
      queueMicrotask(() => child.emit("close", null, "SIGTERM"));
      return true;
    });
    child.stdout = undefined;
    child.stderr = undefined;

    const running = runAbortableCommand(
      "docker",
      ["build", "."],
      {},
      "fake Docker build",
      {
        signal: controller.signal,
        spawnProcess: () => child as unknown as ChildProcess,
      },
    );
    controller.abort(new Error("matrix interrupted"));

    await expect(running).rejects.toThrow("matrix interrupted");
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("preserves Docker exit state and logs in container phase failures", () => {
    expect(
      formatDockerContainerPhaseFailure(
        {
          Error: "process exited",
          ExitCode: 137,
          OOMKilled: true,
        },
        "application startup log",
      ),
    ).toBe(
      "State.OOMKilled=true; State.Error=process exited; State.ExitCode=137; logs=application startup log",
    );
  });

  it("only captures structured server error diagnostics", () => {
    expect(
      isServerErrorDiagnostic({
        code: "CAT_ERROR",
        context: { runtime: "server" },
        level: "error",
        version: 1,
      }),
    ).toBe(true);
    expect(
      isServerErrorDiagnostic({
        err: { code: "ECONNRESET" },
        level: 50,
        msg: "aborted",
      }),
    ).toBe(false);
    expect(
      isServerErrorDiagnostic({
        context: { runtime: "client" },
        level: "error",
        version: 1,
      }),
    ).toBe(false);
    expect(
      isServerErrorDiagnostic({
        diagnostic: {
          code: "CAT_ERROR",
          context: { runtime: "server" },
          level: "error",
          version: 1,
        },
        level: 50,
      }),
    ).toBe(true);
  });

  it("builds its bootstrap CLI without migrating the fresh dev database", async () => {
    const run = vi.fn(async () => undefined);
    const adapter = new DevTargetAdapter(new AbortController().signal, run);
    const runtime = createTestRuntime({
      environment: { DATABASE_URL: "postgresql://localhost/cat" },
    });

    await adapter.prepare(runtime);

    expect(run).toHaveBeenCalledWith(
      "pnpm",
      ["--filter", "@cat/app", "build:bootstrap-only"],
      runtime.environment,
      "development bootstrap CLI preparation",
      "/tmp/cat-e2e-artifacts/bootstrap-cli-build.log",
      expect.any(AbortSignal),
    );
  });

  it("forces the development schema push even when the caller opted out", () => {
    const environment = developmentRuntimeEnvironment(
      createTestRuntime({
        environment: { CAT_DEV_DB_PUSH: "false" },
      }),
      "validation",
    );

    expect(environment).toMatchObject({
      CAT_DEV_DB_PUSH: "true",
      CAT_E2E_VITE_CACHE_DIR: "/tmp/vite-cache/validation",
    });
  });

  it("does not retry scenarios by default", async () => {
    const run = vi.fn(
      async () => await Promise.reject(new Error("failed cell")),
    );

    await expect(
      runExecutionCells([input], { createCell: () => ({ run }) }),
    ).rejects.toThrow("failed cell");
    expect(run).toHaveBeenCalledOnce();
  });

  it("accepts no more than two concurrent cells", async () => {
    await expect(
      runExecutionCells([input], { concurrency: 3 as never }),
    ).rejects.toThrow("must be 1 or 2");
  });

  it("recreates the entire cell for an explicit retry", async () => {
    const first = vi.fn(
      async () => await Promise.reject(new Error("transient")),
    );
    const second = vi.fn(async () => undefined);
    const createCell = vi
      .fn()
      .mockReturnValueOnce({ run: first })
      .mockReturnValueOnce({ run: second });

    await expect(
      runExecutionCells([input], { createCell, retryFailedCells: true }),
    ).resolves.toEqual([input]);
    expect(createCell).toHaveBeenCalledTimes(2);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it("bounds the matrix to two cells, stops scheduling after a failure, and waits for running diagnostics", async () => {
    let releaseSlowCell: (() => void) | undefined;
    const events: string[] = [];
    const slowCell = {
      run: async () => {
        events.push("slow:start");
        await new Promise<void>((resolveRun) => {
          releaseSlowCell = resolveRun;
        });
        events.push("slow:finish");
      },
    };
    const failingCell = {
      run: async () => {
        events.push("failing:start");
        throw new Error("cell failed");
      },
    };
    const createCell = vi
      .fn()
      .mockReturnValueOnce(slowCell)
      .mockReturnValueOnce(failingCell)
      .mockReturnValue({
        run: async () => {
          events.push("unexpected:start");
        },
      });

    const scheduled = runExecutionCells([input, input, input], { createCell });
    await vi.waitFor(() => expect(releaseSlowCell).toBeDefined());
    releaseSlowCell?.();

    await expect(scheduled).rejects.toThrow("cell failed");
    expect(createCell).toHaveBeenCalledTimes(2);
    expect(events).toEqual(["slow:start", "failing:start", "slow:finish"]);
  });

  it("stops dispatching on root cancellation and waits for all active cells to clean up", async () => {
    const controller = new AbortController();
    const events: string[] = [];
    const createCell = vi.fn(() => ({
      run: async (signal: AbortSignal) => {
        events.push("start");
        await new Promise<void>((resolveRun, rejectRun) => {
          signal.addEventListener(
            "abort",
            () => {
              events.push("terminate");
              queueMicrotask(() => {
                events.push("cleanup");
                rejectRun(signal.reason);
              });
            },
            { once: true },
          );
        });
      },
    }));

    const scheduled = runExecutionCells([input, input, input], {
      createCell,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(events).toEqual(["start", "start"]));
    controller.abort(new Error("interrupted"));

    await expect(scheduled).rejects.toThrow("interrupted");
    expect(createCell).toHaveBeenCalledTimes(2);
    expect(events).toEqual([
      "start",
      "start",
      "terminate",
      "terminate",
      "cleanup",
      "cleanup",
    ]);
  });

  it("delivers the root cancellation signal to Playwright before reverse cleanup", async () => {
    const controller = new AbortController();
    const events: string[] = [];
    const runtime: CellRuntime = {
      applicationBindHost: "127.0.0.1",
      applicationPort: 0,
      applicationUrl: "http://127.0.0.1:0",
      artifactDirectory: tmpdir(),
      baseUrl: "http://127.0.0.1:0",
      databaseName: "test",
      databaseUrl: "postgres://test",
      environment: {},
      port: 0,
      probeWorkspace: {
        applicationSourcePath: "probe.vue",
        cacheDirectory: "cache",
        directory: "probe",
        privateJitPackageRoot: "private-jit",
        privateJitSourcePath: "private-jit/probe.vue",
      },
      redisNamespace: "cat-e2e:test",
      refsPath: "refs.json",
      serviceNetworkName: "cat-e2e-test_default",
      storageDirectory: "storage",
    };
    const target: TargetAdapter = {
      applyExternalServicePlan: async () => undefined,
      attest: async () => undefined,
      bootstrap: async () => undefined,
      prepare: async () => undefined,
      start: async () =>
        ({
          child: {
            exitCode: 0,
            pid: undefined,
            signalCode: null,
          } as unknown as StartedProcess["child"],
          diagnostics: [],
          label: "test application",
          ownedPids: new Set(),
          processIdentities: new Map(),
        }) satisfies StartedProcess,
      stop: async () => {
        events.push("stop");
      },
    };
    const cell = new ExecutionCell(
      input,
      {
        createRuntime: async () => runtime,
        createTarget: () => target,
        hydrateFixtures: async () => undefined,
        runPlaywright: async (_environment, _target, _browser, signal) => {
          events.push("playwright");
          await new Promise<void>((_resolveRun, rejectRun) => {
            signal.addEventListener("abort", () => rejectRun(signal.reason), {
              once: true,
            });
          });
        },
      },
      controller.signal,
    );

    const running = cell.run();
    await vi.waitFor(() => expect(events).toEqual(["playwright"]));
    controller.abort(new Error("cancel Playwright"));

    await expect(running).rejects.toThrow("cancel Playwright");
    expect(events).toEqual(["playwright", "stop"]);
  });

  it("aggregates failures from cells that were already running when scheduling stopped", async () => {
    let releaseSecondCell: (() => void) | undefined;
    const firstFailure = new Error("first cell failed");
    const secondFailure = new Error("second cell failed");
    const createCell = vi
      .fn()
      .mockReturnValueOnce({
        run: async () => {
          throw firstFailure;
        },
      })
      .mockReturnValueOnce({
        run: async () => {
          await new Promise<void>((resolveRun) => {
            releaseSecondCell = resolveRun;
          });
          throw secondFailure;
        },
      });

    const scheduled = runExecutionCells([input, input], { createCell });
    await vi.waitFor(() => expect(releaseSecondCell).toBeDefined());
    releaseSecondCell?.();

    await expect(scheduled).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([
        firstFailure,
        secondFailure,
      ]);
      return true;
    });
  });

  it("uses fresh cells for an explicit retry without exceeding two concurrent runs", async () => {
    let active = 0;
    let created = 0;
    let peak = 0;
    const createCell = vi.fn(() => {
      created += 1;
      const failsFirstAttempt = created === 1;
      return {
        run: async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolveRun) => setTimeout(resolveRun, 5));
          active -= 1;
          if (failsFirstAttempt) throw new Error("transient");
        },
      };
    });

    await runExecutionCells([input, input, input], {
      createCell,
      retryFailedCells: true,
    });

    expect(peak).toBe(2);
    expect(createCell).toHaveBeenCalledTimes(4);
  });

  it("does not treat a reused PID as the process it originally started", () => {
    expect(
      processIdentityMatches(
        { command: "node\u0000app", startTime: "10" },
        { command: "node\u0000other", startTime: "11" },
      ),
    ).toBe(false);
  });

  it("cleans a failed probe's process, optimizer, and temporary workspace before the next cell", async () => {
    const workspaces: string[] = [];
    const stopped = vi.fn(async () => undefined);
    const target: TargetAdapter = {
      applyExternalServicePlan: async () => undefined,
      attest: async () => undefined,
      bootstrap: async () => await stopped(),
      prepare: async () => undefined,
      start: async () =>
        ({
          child: {
            exitCode: null,
            pid: undefined,
            signalCode: null,
          } as unknown as StartedProcess["child"],
          diagnostics: [],
          label: "test process",
          ownedPids: new Set(),
          processIdentities: new Map(),
        }) satisfies StartedProcess,
      stop: stopped,
    };
    const createRuntime = async (
      register: (disposer: () => Promise<void>) => () => void,
    ): Promise<CellRuntime> => {
      const artifactDirectory = await mkdtemp(join(tmpdir(), "cat-e2e-cell-"));
      const probeDirectory = join(artifactDirectory, "probe");
      const optimizerDirectory = join(probeDirectory, "optimizer-cache");
      await mkdir(optimizerDirectory, { recursive: true });
      await writeFile(join(optimizerDirectory, "state"), "cold");
      register(
        async () =>
          await rm(artifactDirectory, { force: true, recursive: true }),
      );
      workspaces.push(artifactDirectory);
      return {
        applicationBindHost: "127.0.0.1",
        applicationPort: 0,
        applicationUrl: "http://127.0.0.1:0",
        artifactDirectory,
        baseUrl: "http://127.0.0.1:0",
        databaseName: "test",
        databaseUrl: "postgres://test",
        environment: {},
        port: 0,
        probeWorkspace: {
          applicationSourcePath: join(probeDirectory, "application-probe.vue"),
          cacheDirectory: optimizerDirectory,
          directory: probeDirectory,
          privateJitPackageRoot: join(probeDirectory, "private-jit"),
          privateJitSourcePath: join(
            probeDirectory,
            "private-jit/src/probe.vue",
          ),
        },
        redisNamespace: "cat-e2e:test",
        refsPath: join(artifactDirectory, "refs.json"),
        serviceNetworkName: "cat-e2e-test_default",
        storageDirectory: join(artifactDirectory, "storage"),
      };
    };
    const failure = new Error("development HMR probe failed");
    const failedCell = new ExecutionCell(input, {
      createRuntime,
      createTarget: () => target,
      hydrateFixtures: async () => undefined,
      runPlaywright: async () => await Promise.reject(failure),
      waitForApplicationBootstrap: async () => undefined,
    });

    await expect(failedCell.run()).rejects.toThrow(failure.message);
    expect(stopped).toHaveBeenCalledTimes(2);
    expect(workspaces).toHaveLength(1);
    expect(existsSync(workspaces[0]!)).toBe(false);

    const nextCell = new ExecutionCell(input, {
      createRuntime,
      createTarget: () => target,
      hydrateFixtures: async () => undefined,
      runPlaywright: async () => undefined,
      waitForApplicationBootstrap: async () => undefined,
    });
    await nextCell.run();

    expect(workspaces).toHaveLength(2);
    expect(workspaces[1]).not.toBe(workspaces[0]);
    expect(existsSync(workspaces[1]!)).toBe(false);
  });

  it("stops and drains the application before combining Playwright and server failures", async () => {
    const events: string[] = [];
    const validation = {
      child: {
        exitCode: 0,
        pid: undefined,
        signalCode: null,
      } as unknown as StartedProcess["child"],
      diagnostics: [new Error("server diagnostic")],
      drainLogs: async () => {
        events.push("drain");
      },
      label: "validation process",
      ownedPids: new Set<number>(),
      processIdentities: new Map<number, never>(),
    } satisfies StartedProcess;
    const target: TargetAdapter = {
      applyExternalServicePlan: async () => undefined,
      attest: async () => undefined,
      bootstrap: async () => undefined,
      prepare: async () => undefined,
      start: async () => validation,
      stop: async (process) => {
        events.push("stop");
        await process.drainLogs?.();
      },
    };
    const runtime: CellRuntime = {
      applicationBindHost: "127.0.0.1",
      applicationPort: 0,
      applicationUrl: "http://127.0.0.1:0",
      artifactDirectory: tmpdir(),
      baseUrl: "http://127.0.0.1:0",
      databaseName: "test",
      databaseUrl: "postgres://test",
      environment: {},
      port: 0,
      probeWorkspace: {
        applicationSourcePath: "probe.vue",
        cacheDirectory: "cache",
        directory: "probe",
        privateJitPackageRoot: "private-jit",
        privateJitSourcePath: "private-jit/probe.vue",
      },
      redisNamespace: "cat-e2e:test",
      refsPath: "refs.json",
      serviceNetworkName: "cat-e2e-test_default",
      storageDirectory: "storage",
    };
    const playwrightFailure = new Error("Playwright failed");
    const cell = new ExecutionCell(input, {
      createRuntime: async () => runtime,
      createTarget: () => target,
      hydrateFixtures: async () => undefined,
      runPlaywright: async () => {
        events.push("playwright");
        throw playwrightFailure;
      },
    });

    let failure: unknown;
    try {
      await cell.run();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors[0]).toBe(playwrightFailure);
    expect(events).toEqual(["playwright", "stop", "drain"]);
  });
});
