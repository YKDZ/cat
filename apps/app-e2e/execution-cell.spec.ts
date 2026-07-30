import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  ExecutionCell,
  DevTargetAdapter,
  developmentRuntimeEnvironment,
  formatDockerContainerPhaseFailure,
  isServerErrorDiagnostic,
  playwrightChildEnvironment,
  persistOneShotPreparerAttestation,
  processIdentityMatches,
  runAbortableCommand,
  runExecutionCells,
  stopStartedProcess,
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

const discardCellOutput = (_message: string): void => undefined;

const recordedProcessIds = (paths: string[]): number[] => [
  ...new Set(
    paths.flatMap((path) => {
      if (!existsSync(path)) return [];
      return readFileSync(path, "utf8")
        .split(",")
        .map(Number)
        .filter(Number.isSafeInteger);
    }),
  ),
];

const killRecordedProcesses = (processIds: number[]): void => {
  for (const processId of processIds) {
    try {
      process.kill(processId, "SIGKILL");
    } catch {}
  }
};

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
  it("reports one concise successful cell lifecycle and removes its diagnostics", async () => {
    const artifactDirectory = await mkdtemp(join(tmpdir(), "cat-e2e-cell-"));
    const output: string[] = [];
    const target: TargetAdapter = {
      applyExternalServicePlan: async () => undefined,
      attest: async () => undefined,
      bootstrap: async () => undefined,
      prepare: async () => undefined,
      start: async () =>
        ({
          child: { exitCode: 0, signalCode: null } as ChildProcess,
          diagnostics: [],
          label: "test application",
          ownedPids: new Set(),
          processIdentities: new Map(),
        }) satisfies StartedProcess,
      stop: async () => undefined,
    };

    await new ExecutionCell(input, {
      createRuntime: async () => createTestRuntime({ artifactDirectory }),
      createTarget: () => target,
      hydrateFixtures: async () => undefined,
      runPlaywright: async () => undefined,
      write: (message) => output.push(message),
      writeError: discardCellOutput,
    }).run();

    expect(output).toHaveLength(2);
    expect(output[0]).toBe(
      "e2e cell target=dev browser=chromium image=development status=started",
    );
    expect(output[1]).toMatch(
      /^e2e cell target=dev browser=chromium result=passed duration=\d+ms cleanup=passed$/,
    );
    expect(existsSync(artifactDirectory)).toBe(false);
  });

  it("preserves artifact-cleanup as the phase when successful validation cannot remove artifacts", async () => {
    const artifactDirectory = await mkdtemp(join(tmpdir(), "cat-e2e-cell-"));
    const errors: string[] = [];
    const target: TargetAdapter = {
      applyExternalServicePlan: async () => undefined,
      attest: async () => undefined,
      bootstrap: async () => undefined,
      prepare: async () => undefined,
      start: async () =>
        ({
          child: { exitCode: 0, signalCode: null } as ChildProcess,
          diagnostics: [],
          label: "test application",
          ownedPids: new Set(),
          processIdentities: new Map(),
        }) satisfies StartedProcess,
      stop: async () => undefined,
    };

    try {
      await expect(
        new ExecutionCell(input, {
          createRuntime: async () => createTestRuntime({ artifactDirectory }),
          createTarget: () => target,
          hydrateFixtures: async () => undefined,
          removeArtifacts: async () => {
            throw new Error("artifact removal failed");
          },
          runPlaywright: async () => undefined,
          write: discardCellOutput,
          writeError: (message) => errors.push(message),
        }).run(),
      ).rejects.toThrow("Execution cell cleanup failed");

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("phase=artifact-cleanup");
      expect(errors[0]).not.toContain("phase=cleanup");
    } finally {
      await rm(artifactDirectory, { force: true, recursive: true });
    }
  });

  it("retains failed cell diagnostics and reports failure context to stderr", async () => {
    const artifactDirectory = await mkdtemp(join(tmpdir(), "cat-e2e-cell-"));
    const playwrightOutput = join(artifactDirectory, "playwright");
    await mkdir(join(playwrightOutput, ".auth"), { recursive: true });
    await writeFile(join(playwrightOutput, ".auth", "admin.json"), "secret");
    await writeFile(join(playwrightOutput, "trace.zip"), "trace");
    const errors: string[] = [];
    const target: TargetAdapter = {
      applyExternalServicePlan: async () => undefined,
      attest: async () => undefined,
      bootstrap: async () => undefined,
      prepare: async () => undefined,
      start: async () =>
        ({
          child: { exitCode: 0, signalCode: null } as ChildProcess,
          diagnostics: [],
          label: "test application",
          ownedPids: new Set(),
          processIdentities: new Map(),
        }) satisfies StartedProcess,
      stop: async () => undefined,
    };

    await expect(
      new ExecutionCell(input, {
        createRuntime: async () =>
          createTestRuntime({
            artifactDirectory,
            environment: { CAT_E2E_OUTPUT_DIR: playwrightOutput },
          }),
        createTarget: () => target,
        hydrateFixtures: async () => undefined,
        runPlaywright: async () => {
          throw new Error("browser validation failed");
        },
        write: discardCellOutput,
        writeError: (message) => errors.push(message),
      }).run(),
    ).rejects.toThrow("browser validation failed");

    expect(existsSync(artifactDirectory)).toBe(true);
    expect(existsSync(join(playwrightOutput, ".auth"))).toBe(false);
    expect(existsSync(join(playwrightOutput, "trace.zip"))).toBe(true);
    expect(errors).toEqual([
      expect.stringContaining(
        `e2e cell target=dev browser=chromium result=failed artifact=${artifactDirectory} cleanup=passed`,
      ),
    ]);
    expect(errors[0]).toContain("phase=playwright");
    expect(errors[0]).toContain("browser validation failed");
    await rm(artifactDirectory, { force: true, recursive: true });
  });

  it("reports the primary phase and every nested validation and cleanup error", async () => {
    const artifactDirectory = await mkdtemp(join(tmpdir(), "cat-e2e-cell-"));
    const errors: string[] = [];
    const output: string[] = [];
    const target: TargetAdapter = {
      applyExternalServicePlan: async () => undefined,
      attest: async () => undefined,
      bootstrap: async () => undefined,
      prepare: async () => undefined,
      start: async () =>
        ({
          child: { exitCode: 0, signalCode: null } as ChildProcess,
          diagnostics: [new Error("server diagnostic failed")],
          label: "test application",
          ownedPids: new Set(),
          processIdentities: new Map(),
        }) satisfies StartedProcess,
      stop: async () => {
        throw new Error("application stop failed");
      },
    };
    try {
      await expect(
        new ExecutionCell(input, {
          createRuntime: async (register) => {
            register("test resource", async () => {
              throw new Error("resource cleanup failed");
            });
            return createTestRuntime({ artifactDirectory });
          },
          createTarget: () => target,
          hydrateFixtures: async () => undefined,
          runPlaywright: async () => {
            throw new Error("browser validation failed");
          },
          write: (message) => output.push(message),
          writeError: (message) => errors.push(message),
        }).run(),
      ).rejects.toBeInstanceOf(AggregateError);
      expect(output).toHaveLength(2);
      expect(output[1]).toMatch(/result=failed .* cleanup=failed$/);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("phase=playwright");
      expect(errors[0]).toContain("browser validation failed");
      expect(errors[0]).toContain("phase=stop");
      expect(errors[0]).toContain("application stop failed");
      expect(errors[0]).toContain("phase=server-diagnostics");
      expect(errors[0]).toContain("server diagnostic failed");
      expect(errors[0]).toContain("phase=cleanup");
      expect(errors[0]).toContain("resource cleanup failed");
    } finally {
      await rm(artifactDirectory, { force: true, recursive: true });
    }
  });

  it("aborts a timed-out cleanup by its resource label and waits for settlement", async () => {
    vi.useFakeTimers();
    const artifactDirectory = await mkdtemp(join(tmpdir(), "cat-e2e-cell-"));
    const errors: string[] = [];
    let cleanupAborted = false;
    const target: TargetAdapter = {
      applyExternalServicePlan: async () => undefined,
      attest: async () => undefined,
      bootstrap: async () => undefined,
      prepare: async () => undefined,
      start: async () =>
        ({
          child: { exitCode: 0, signalCode: null } as ChildProcess,
          diagnostics: [],
          label: "test application",
          ownedPids: new Set(),
          processIdentities: new Map(),
        }) satisfies StartedProcess,
      stop: async () => undefined,
    };

    try {
      const running = new ExecutionCell(input, {
        cleanupTimeoutMs: 10,
        createRuntime: async (register) => {
          register("slow test resource", async (signal) => {
            await new Promise<void>((_resolve, reject) => {
              signal.addEventListener(
                "abort",
                () => {
                  cleanupAborted = true;
                  reject(signal.reason);
                },
                { once: true },
              );
            });
          });
          return createTestRuntime({ artifactDirectory });
        },
        createTarget: () => target,
        hydrateFixtures: async () => undefined,
        runPlaywright: async () => undefined,
        write: discardCellOutput,
        writeError: (message) => errors.push(message),
      }).run();

      const rejection = expect(running).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(AggregateError);
        expect((error as AggregateError).errors).toEqual([
          expect.objectContaining({
            message:
              "Execution cell cleanup timed out label=slow test resource duration=10ms",
          }),
        ]);
        return true;
      });
      await vi.advanceTimersByTimeAsync(10);

      await rejection;
      expect(cleanupAborted).toBe(true);
      expect(errors).toContain(
        "e2e cleanup label=slow test resource status=timed-out duration=10ms waiting=resource-settlement",
      );
    } finally {
      vi.useRealTimers();
      await rm(artifactDirectory, { force: true, recursive: true });
    }
  });

  it("fails closed after a non-cooperative cleanup breaches its hard settlement deadline", async () => {
    vi.useFakeTimers();
    const artifactDirectory = await mkdtemp(join(tmpdir(), "cat-e2e-cell-"));
    const errors: string[] = [];
    const target: TargetAdapter = {
      applyExternalServicePlan: async () => undefined,
      attest: async () => undefined,
      bootstrap: async () => undefined,
      prepare: async () => undefined,
      start: async () =>
        ({
          child: { exitCode: 0, signalCode: null } as ChildProcess,
          diagnostics: [],
          label: "test application",
          ownedPids: new Set(),
          processIdentities: new Map(),
        }) satisfies StartedProcess,
      stop: async () => undefined,
    };
    let created = 0;
    let reportFatalFailure = (_error: Error): void => undefined;
    const cell = new ExecutionCell(
      input,
      {
        cleanupSettlementTimeoutMs: 5,
        cleanupTimeoutMs: 10,
        createRuntime: async (register) => {
          register(
            "post-breach cleanup",
            async () =>
              await new Promise<void>((resolveCleanup) =>
                setTimeout(resolveCleanup, 20),
              ),
          );
          register(
            "slow token=cleanup-secret",
            async () => await new Promise<void>(() => undefined),
          );
          return createTestRuntime({ artifactDirectory });
        },
        createTarget: () => target,
        hydrateFixtures: async () => undefined,
        runPlaywright: async () => undefined,
        write: discardCellOutput,
        writeError: (message) => errors.push(message),
      },
      new AbortController().signal,
      (error) => reportFatalFailure(error),
    );

    try {
      const scheduled = runExecutionCells([input, input, input], {
        concurrency: 2,
        createCell: (_current, reportFatal) => {
          created += 1;
          reportFatalFailure = reportFatal;
          if (created === 1) return cell;
          return {
            run: async () =>
              await new Promise<void>((resolveRun) =>
                setTimeout(resolveRun, 20),
              ),
          };
        },
      });
      const outcome = Promise.race([
        scheduled.then(
          () => "resolved",
          () => "rejected",
        ),
        new Promise<"hung">((resolveHung) =>
          setTimeout(() => resolveHung("hung"), 40),
        ),
      ]);

      await vi.advanceTimersByTimeAsync(40);

      await expect(outcome).resolves.toBe("rejected");
      expect(created).toBe(2);
      expect(errors).toContainEqual(
        expect.stringMatching(
          /^e2e cleanup label=slow token=\[REDACTED\] status=timed-out duration=10ms waiting=resource-settlement$/,
        ),
      );
      expect(errors).toContainEqual(
        expect.stringMatching(
          /^e2e cleanup label=slow token=\[REDACTED\] status=hard-timeout duration=15ms$/,
        ),
      );
      expect(errors).toContainEqual(
        expect.stringContaining(
          "Execution cell cleanup hard timeout label=slow token=[REDACTED]",
        ),
      );
      expect(errors.join("\n")).not.toContain("cleanup-secret");
    } finally {
      vi.useRealTimers();
      await rm(artifactDirectory, { force: true, recursive: true });
    }
  });

  it("bounds recursive failure diagnostics and redacts every emitted message", async () => {
    const artifactDirectory = await mkdtemp(join(tmpdir(), "cat-e2e-cell-"));
    const errors: string[] = [];
    const root = new Error(
      "root sessionId=session-secret https://admin:url-secret@example.test",
    );
    Object.assign(root, { cause: root });
    const repeated = new Error("csrfToken=csrf-secret");
    const wide = new AggregateError(
      [...Array.from({ length: 20 }, () => repeated), root],
      "Authorization: Bearer bearer-secret",
    );
    const deep = Array.from({ length: 12 }).reduce<Error>(
      (cause, _value, index) =>
        new Error(`depth=${index} token=deep-secret`, { cause }),
      wide,
    );
    const target: TargetAdapter = {
      applyExternalServicePlan: async () => undefined,
      attest: async () => undefined,
      bootstrap: async () => undefined,
      prepare: async () => undefined,
      start: async () =>
        ({
          child: { exitCode: 0, signalCode: null } as ChildProcess,
          diagnostics: [],
          label: "test application",
          ownedPids: new Set(),
          processIdentities: new Map(),
        }) satisfies StartedProcess,
      stop: async () => undefined,
    };

    try {
      await expect(
        new ExecutionCell(input, {
          createRuntime: async () => createTestRuntime({ artifactDirectory }),
          createTarget: () => target,
          hydrateFixtures: async () => undefined,
          runPlaywright: async () => {
            throw deep;
          },
          write: () => undefined,
          writeError: (message) => errors.push(message),
        }).run(),
      ).rejects.toThrow("depth=11");

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("phase=playwright");
      expect(errors[0]).toContain("depth=11");
      expect(errors[0]).toContain("failure-tree-truncated=depth");
      expect(errors[0]).not.toContain("deep-secret");
      expect(errors[0]).not.toContain("session-secret");
      expect(errors[0]).not.toContain("url-secret");
    } finally {
      await rm(artifactDirectory, { force: true, recursive: true });
    }
  });

  it("marks repeated and cyclic failure causes without hiding the original failure", async () => {
    const artifactDirectory = await mkdtemp(join(tmpdir(), "cat-e2e-cell-"));
    const errors: string[] = [];
    const repeated = new Error("repeated token=repeated-secret");
    const cyclic = new Error("cyclic password=cyclic-secret");
    Object.assign(cyclic, { cause: cyclic });
    const target: TargetAdapter = {
      applyExternalServicePlan: async () => undefined,
      attest: async () => undefined,
      bootstrap: async () => undefined,
      prepare: async () => undefined,
      start: async () =>
        ({
          child: { exitCode: 0, signalCode: null } as ChildProcess,
          diagnostics: [],
          label: "test application",
          ownedPids: new Set(),
          processIdentities: new Map(),
        }) satisfies StartedProcess,
      stop: async () => undefined,
    };
    try {
      await expect(
        new ExecutionCell(input, {
          createRuntime: async () => createTestRuntime({ artifactDirectory }),
          createTarget: () => target,
          hydrateFixtures: async () => undefined,
          runPlaywright: async () => {
            throw new AggregateError(
              [repeated, repeated, cyclic],
              "root failure",
            );
          },
          write: () => undefined,
          writeError: (message) => errors.push(message),
        }).run(),
      ).rejects.toThrow("root failure");

      expect(errors[0]).toContain("root failure");
      expect(errors[0]).toContain("failure-tree-cycle");
      expect(errors[0]).not.toContain("repeated-secret");
      expect(errors[0]).not.toContain("cyclic-secret");
    } finally {
      await rm(artifactDirectory, { force: true, recursive: true });
    }
  });

  it("truncates a wide aggregate after preserving its safe primary context", async () => {
    const artifactDirectory = await mkdtemp(join(tmpdir(), "cat-e2e-cell-"));
    const errors: string[] = [];
    const target: TargetAdapter = {
      applyExternalServicePlan: async () => undefined,
      attest: async () => undefined,
      bootstrap: async () => undefined,
      prepare: async () => undefined,
      start: async () =>
        ({
          child: { exitCode: 0, signalCode: null } as ChildProcess,
          diagnostics: [],
          label: "test application",
          ownedPids: new Set(),
          processIdentities: new Map(),
        }) satisfies StartedProcess,
      stop: async () => undefined,
    };
    try {
      await expect(
        new ExecutionCell(input, {
          createRuntime: async () => createTestRuntime({ artifactDirectory }),
          createTarget: () => target,
          hydrateFixtures: async () => undefined,
          runPlaywright: async () => {
            throw new AggregateError(
              Array.from(
                { length: 20 },
                (_value, index) =>
                  new Error(`child=${index} token=wide-secret`),
              ),
              "wide validation failure",
            );
          },
          write: discardCellOutput,
          writeError: (message) => errors.push(message),
        }).run(),
      ).rejects.toThrow("wide validation failure");

      expect(errors[0]).toContain("wide validation failure");
      expect(errors[0]).toContain("failure-tree-truncated=children");
      expect(errors[0]).not.toContain("wide-secret");
    } finally {
      await rm(artifactDirectory, { force: true, recursive: true });
    }
  });

  it("does not mutate DATABASE_URL while hydrating fixtures", () => {
    const source = readFileSync(
      join(import.meta.dirname, "execution-cell.ts"),
      "utf8",
    );

    expect(source).not.toContain("process.env.DATABASE_URL =");
    expect(source).not.toContain("delete process.env.DATABASE_URL");
  });

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

  it("uses the command-specific timeout when provided", async () => {
    vi.useFakeTimers();
    try {
      const child = new EventEmitter() as EventEmitter & {
        kill: ReturnType<typeof vi.fn>;
        stderr: undefined;
        stdout: undefined;
      };
      child.kill = vi.fn((signal: NodeJS.Signals) => {
        if (signal === "SIGTERM") {
          queueMicrotask(() => child.emit("close", null, "SIGTERM"));
        }
        return true;
      });
      child.stdout = undefined;
      child.stderr = undefined;

      const running = runAbortableCommand(
        "pnpm",
        ["exec", "playwright", "test"],
        {},
        "fake Playwright",
        {
          spawnProcess: () => child as unknown as ChildProcess,
          timeoutMs: 10_000,
        },
      );
      const rejection = expect(running).rejects.toThrow(
        "Timed out during fake Playwright",
      );

      await vi.advanceTimersByTimeAsync(9_999);
      expect(child.kill).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await rejection;
      expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    } finally {
      vi.useRealTimers();
    }
  });

  it("escalates an abort from SIGTERM to SIGKILL and waits for close", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const child = new EventEmitter() as EventEmitter & {
        exitCode: null;
        kill: ReturnType<typeof vi.fn>;
        signalCode: null;
        stderr: undefined;
        stdout: undefined;
      };
      child.exitCode = null;
      child.signalCode = null;
      child.kill = vi.fn((signal: NodeJS.Signals) => {
        if (signal === "SIGKILL") {
          queueMicrotask(() => child.emit("close", null, "SIGKILL"));
        }
        return true;
      });
      child.stdout = undefined;
      child.stderr = undefined;

      const running = runAbortableCommand(
        "node",
        ["long-running-child.js"],
        {},
        "stubborn child",
        {
          signal: controller.signal,
          spawnProcess: () => child as unknown as ChildProcess,
          terminationGraceMs: 10,
        },
      );
      const rejection = expect(running).rejects.toThrow("matrix interrupted");
      controller.abort(new Error("matrix interrupted"));

      await vi.advanceTimersByTimeAsync(60_000);
      await rejection;

      expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
      expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
    } finally {
      vi.useRealTimers();
    }
  });

  it("manages an early output stream failure through child termination and close", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cat-e2e-output-"));
    const child = new EventEmitter() as EventEmitter & {
      exitCode: null;
      kill: ReturnType<typeof vi.fn>;
      signalCode: NodeJS.Signals | null;
      stderr: undefined;
      stdout: undefined;
    };
    child.exitCode = null;
    child.signalCode = null;
    child.kill = vi.fn((signal: NodeJS.Signals) => {
      if (signal === "SIGKILL") {
        child.signalCode = signal;
        queueMicrotask(() => child.emit("close", null, signal));
      }
      return true;
    });
    child.stdout = undefined;
    child.stderr = undefined;

    try {
      await expect(
        runAbortableCommand("node", ["child.js"], {}, "output child", {
          outputPath: join(directory, "missing", "child.log"),
          spawnProcess: () => child as unknown as ChildProcess,
          terminationGraceMs: 5,
        }),
      ).rejects.toThrow(/Could not write output for output child: ENOENT/);

      expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
      expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
      expect(child.listenerCount("close")).toBe(0);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("kills a real child that refuses SIGTERM and flushes its output before rejecting", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cat-e2e-child-"));
    const marker = join(directory, "ready");
    const output = join(directory, "child.log");
    const controller = new AbortController();
    let pid: number | undefined;
    try {
      const running = runAbortableCommand(
        process.execPath,
        [
          "-e",
          "const fs=require('node:fs'); process.on('SIGTERM',()=>{}); fs.writeFileSync(process.argv[1],String(process.pid)); process.stdout.write('ready\\n'); setInterval(()=>{},1000)",
          marker,
        ],
        process.env,
        "real stubborn child",
        {
          outputPath: output,
          signal: controller.signal,
          terminationGraceMs: 25,
          timeoutMs: 5_000,
        },
      );
      await vi.waitFor(() => expect(existsSync(marker)).toBe(true), {
        timeout: 2_000,
      });
      pid = Number(readFileSync(marker, "utf8"));
      const rejection = expect(running).rejects.toThrow("stop real child");
      controller.abort(new Error("stop real child"));

      await rejection;

      expect(readFileSync(output, "utf8")).toContain("ready");
      expect(() => process.kill(pid!, 0)).toThrow(
        expect.objectContaining({ code: "ESRCH" }),
      );
    } finally {
      if (pid !== undefined) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {}
      }
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("escalates a detached process group when its leader exits after TERM but a captured grandchild survives", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cat-e2e-process-group-"));
    const marker = join(directory, "pids");
    const grandchildMarker = join(directory, "grandchild");
    const controller = new AbortController();
    let pids: number[] = [];
    const grandchild = [
      "const fs = require('node:fs');",
      "fs.writeFileSync(process.argv[1], String(process.pid));",
      "process.on('SIGTERM', () => {});",
      "setInterval(() => {}, 1_000);",
    ].join(" ");
    const parent = [
      "const fs = require('node:fs');",
      "const { spawn } = require('node:child_process');",
      `const child = spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}, process.argv[2]], { stdio: 'inherit' });`,
      "fs.writeFileSync(process.argv[1], `${process.pid},${child.pid}`);",
      "process.stdout.write('ready\\n');",
      "setInterval(() => {}, 1_000);",
    ].join(" ");
    try {
      const running = runAbortableCommand(
        process.execPath,
        ["-e", parent, marker, grandchildMarker],
        process.env,
        "real process group",
        {
          outputPath: join(directory, "command.log"),
          signal: controller.signal,
          terminationGraceMs: 25,
          timeoutMs: 5_000,
        },
      );
      await vi.waitFor(() => expect(existsSync(marker)).toBe(true), {
        timeout: 2_000,
      });
      await vi.waitFor(() => expect(existsSync(grandchildMarker)).toBe(true), {
        timeout: 2_000,
      });
      pids = readFileSync(marker, "utf8").split(",").map(Number);
      expect(pids).toHaveLength(2);
      const rejection = expect(running).rejects.toThrow("stop process group");
      controller.abort(new Error("stop process group"));
      await rejection;

      for (const pid of pids) {
        expect(() => process.kill(pid, 0)).toThrow(
          expect.objectContaining({ code: "ESRCH" }),
        );
      }
    } finally {
      killRecordedProcesses(
        pids.length > 0 ? pids : recordedProcessIds([marker, grandchildMarker]),
      );
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("escalates a detached process group after its leader closes with inherited stdio", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cat-e2e-process-group-"));
    const marker = join(directory, "pids");
    const grandchildMarker = join(directory, "grandchild");
    const controller = new AbortController();
    let pids: number[] = [];
    const grandchild = [
      "const fs = require('node:fs');",
      "fs.writeFileSync(process.argv[1], String(process.pid));",
      "process.on('SIGTERM', () => {});",
      "setInterval(() => {}, 1_000);",
    ].join(" ");
    const parent = [
      "const fs = require('node:fs');",
      "const { spawn } = require('node:child_process');",
      `const child = spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}, process.argv[2]], { stdio: 'inherit' });`,
      "fs.writeFileSync(process.argv[1], `${process.pid},${child.pid}`);",
      "setInterval(() => {}, 1_000);",
    ].join(" ");
    try {
      const running = runAbortableCommand(
        process.execPath,
        ["-e", parent, marker, grandchildMarker],
        process.env,
        "real inherited process group",
        {
          signal: controller.signal,
          stdio: "inherit",
          terminationGraceMs: 25,
          timeoutMs: 5_000,
        },
      );
      await vi.waitFor(() => expect(existsSync(marker)).toBe(true), {
        timeout: 2_000,
      });
      await vi.waitFor(() => expect(existsSync(grandchildMarker)).toBe(true), {
        timeout: 2_000,
      });
      pids = readFileSync(marker, "utf8").split(",").map(Number);
      const rejection = expect(running).rejects.toThrow(
        "stop inherited process group",
      );
      controller.abort(new Error("stop inherited process group"));
      await rejection;

      await vi.waitFor(
        () => {
          for (const pid of pids) {
            expect(() => process.kill(pid, 0)).toThrow(
              expect.objectContaining({ code: "ESRCH" }),
            );
          }
        },
        { timeout: 2_000 },
      );
    } finally {
      killRecordedProcesses(
        pids.length > 0 ? pids : recordedProcessIds([marker, grandchildMarker]),
      );
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("falls back to the child when a fake process group is unavailable", async () => {
    const controller = new AbortController();
    const child = new EventEmitter() as EventEmitter & {
      exitCode: null;
      kill: ReturnType<typeof vi.fn>;
      pid: number;
      signalCode: NodeJS.Signals | null;
      stderr: undefined;
      stdout: undefined;
    };
    child.exitCode = null;
    child.pid = 123_456;
    child.signalCode = null;
    child.stderr = undefined;
    child.stdout = undefined;
    child.kill = vi.fn((signal: NodeJS.Signals) => {
      child.signalCode = signal;
      queueMicrotask(() => child.emit("close", null, signal));
      return true;
    });
    const processKill = vi.spyOn(process, "kill").mockImplementation(((
      pid: number,
    ) => {
      if (pid === -child.pid) {
        const error = Object.assign(new Error("missing process group"), {
          code: "ESRCH",
        });
        throw error;
      }
      return true;
    }) as typeof process.kill);

    try {
      const running = runAbortableCommand(
        "node",
        ["fake-group.js"],
        {},
        "fake process group",
        {
          signal: controller.signal,
          spawnProcess: () => child as unknown as ChildProcess,
        },
      );
      const rejection = expect(running).rejects.toThrow("stop fake group");
      controller.abort(new Error("stop fake group"));
      await rejection;

      expect(processKill).toHaveBeenCalledWith(-child.pid, "SIGTERM");
      expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    } finally {
      processKill.mockRestore();
    }
  });

  it("reports a controlled failure when fallback child signalling is denied", async () => {
    const controller = new AbortController();
    const child = new EventEmitter() as EventEmitter & {
      kill: ReturnType<typeof vi.fn>;
      pid: number;
      stderr: undefined;
      stdout: undefined;
    };
    child.pid = 123_456;
    child.stderr = undefined;
    child.stdout = undefined;
    child.kill = vi.fn(() => {
      throw Object.assign(new Error("permission denied"), { code: "EPERM" });
    });
    const processKill = vi.spyOn(process, "kill").mockImplementation(((
      pid: number,
    ) => {
      if (pid === -child.pid) {
        throw Object.assign(new Error("missing process group"), {
          code: "ESRCH",
        });
      }
      return true;
    }) as typeof process.kill);

    try {
      const running = runAbortableCommand(
        "node",
        ["unavailable-group.js"],
        {},
        "unavailable process group",
        {
          signal: controller.signal,
          spawnProcess: () => child as unknown as ChildProcess,
        },
      );
      controller.abort(new Error("stop unavailable group"));

      await expect(running).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(AggregateError);
        expect(error).toMatchObject({
          message: "Could not terminate unavailable process group",
        });
        expect((error as AggregateError).errors).toContainEqual(
          expect.objectContaining({
            message:
              "Could not signal child process with SIGTERM: permission denied",
          }),
        );
        return true;
      });
      expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    } finally {
      processKill.mockRestore();
    }
  });

  it("force-stops an already-aborted process and drains logs before rejecting", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cleanup already aborted"));
    const child = new EventEmitter() as EventEmitter & {
      exitCode: null;
      signalCode: NodeJS.Signals | null;
    };
    child.exitCode = null;
    child.signalCode = null;
    const events: string[] = [];
    const started = {
      child: child as unknown as ChildProcess,
      diagnostics: [],
      drainLogs: async () => {
        events.push("drain");
      },
      label: "already aborted process",
      ownedPids: new Set<number>(),
      processIdentities: new Map<number, never>(),
    } satisfies StartedProcess;

    await expect(
      stopStartedProcess(started, {
        forceStop: async () => {
          events.push("force");
          child.signalCode = "SIGKILL";
          child.emit("close", null, "SIGKILL");
        },
        gracefulStop: async () => {
          events.push("graceful");
        },
        signal: controller.signal,
      }),
    ).rejects.toThrow("cleanup already aborted");

    expect(events).toEqual(["force", "drain"]);
    expect(child.listenerCount("close")).toBe(0);
  });

  it("force-stops after a bounded graceful wait and removes the close listener", async () => {
    vi.useFakeTimers();
    try {
      const child = new EventEmitter() as EventEmitter & {
        exitCode: null;
        signalCode: NodeJS.Signals | null;
      };
      child.exitCode = null;
      child.signalCode = null;
      const events: string[] = [];
      const started = {
        child: child as unknown as ChildProcess,
        diagnostics: [],
        drainLogs: async () => {
          events.push("drain");
        },
        label: "stubborn process",
        ownedPids: new Set<number>(),
        processIdentities: new Map<number, never>(),
      } satisfies StartedProcess;
      const running = stopStartedProcess(started, {
        forceStop: async () => {
          events.push("force");
          child.signalCode = "SIGKILL";
          child.emit("close", null, "SIGKILL");
        },
        gracefulStop: async () => {
          events.push("graceful");
        },
        gracefulTimeoutMs: 10,
        signal: new AbortController().signal,
      });

      await vi.advanceTimersByTimeAsync(10);
      await running;

      expect(events).toEqual(["graceful", "force", "drain"]);
      expect(child.listenerCount("close")).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("force-finalizes a log drain after its bounded wait", async () => {
    vi.useFakeTimers();
    try {
      let resolveDrain: (() => void) | undefined;
      const forceDrainLogs = vi.fn(() => resolveDrain?.());
      const child = new EventEmitter() as EventEmitter & {
        exitCode: number;
        signalCode: null;
      };
      child.exitCode = 0;
      child.signalCode = null;
      const started = {
        child: child as unknown as ChildProcess,
        diagnostics: [],
        drainLogs: async () =>
          await new Promise<void>((resolveLogs) => {
            resolveDrain = resolveLogs;
          }),
        forceDrainLogs,
        label: "stuck log drain",
        ownedPids: new Set<number>(),
        processIdentities: new Map<number, never>(),
      } satisfies StartedProcess;
      const running = stopStartedProcess(started, {
        drainTimeoutMs: 10,
        forceStop: async () => undefined,
        gracefulStop: async () => undefined,
        signal: new AbortController().signal,
      });

      await vi.advanceTimersByTimeAsync(10);
      await running;

      expect(forceDrainLogs).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("abandons a non-cooperative graceful callback at its hard deadline and still force-stops", async () => {
    vi.useFakeTimers();
    try {
      const child = new EventEmitter() as EventEmitter & {
        exitCode: null;
        signalCode: NodeJS.Signals | null;
      };
      child.exitCode = null;
      child.signalCode = null;
      const events: string[] = [];
      const started = {
        child: child as unknown as ChildProcess,
        diagnostics: [],
        label: "stuck graceful callback",
        ownedPids: new Set<number>(),
        processIdentities: new Map<number, never>(),
      } satisfies StartedProcess;
      const running = stopStartedProcess(started, {
        callbackSettlementTimeoutMs: 5,
        callbackTimeoutMs: 10,
        forceStop: async () => {
          events.push("force");
          child.signalCode = "SIGKILL";
          child.emit("close", null, "SIGKILL");
        },
        gracefulStop: async () => await new Promise<void>(() => undefined),
        signal: new AbortController().signal,
      });
      const outcome = Promise.race([
        running.then(
          () => "resolved",
          () => "rejected",
        ),
        new Promise<"hung">((resolveHung) =>
          setTimeout(() => resolveHung("hung"), 25),
        ),
      ]);

      await vi.advanceTimersByTimeAsync(25);

      await expect(outcome).resolves.toBe("rejected");
      expect(events).toEqual(["force"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails within the hard deadline when an already-required force callback is non-cooperative", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      controller.abort(new Error("cleanup aborted"));
      const child = new EventEmitter() as EventEmitter & {
        exitCode: null;
        signalCode: null;
      };
      child.exitCode = null;
      child.signalCode = null;
      const started = {
        child: child as unknown as ChildProcess,
        diagnostics: [],
        label: "stuck force callback",
        ownedPids: new Set<number>(),
        processIdentities: new Map<number, never>(),
      } satisfies StartedProcess;
      const running = stopStartedProcess(started, {
        callbackSettlementTimeoutMs: 5,
        callbackTimeoutMs: 10,
        forceExitTimeoutMs: 5,
        forceStop: async () => await new Promise<void>(() => undefined),
        gracefulStop: async () => undefined,
        signal: controller.signal,
      });
      const outcome = Promise.race([
        running.then(
          () => "resolved",
          () => "rejected",
        ),
        new Promise<"hung">((resolveHung) =>
          setTimeout(() => resolveHung("hung"), 25),
        ),
      ]);

      await vi.advanceTimersByTimeAsync(25);

      await expect(outcome).resolves.toBe("rejected");
    } finally {
      vi.useRealTimers();
    }
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

  it("persists only minimal one-shot preparer attestation evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cat-e2e-attestation-"));
    const path = join(directory, "preparer.attestation.json");
    try {
      await persistOneShotPreparerAttestation(
        path,
        {
          Config: {
            Env: ["DATABASE_URL=postgresql://user:secret@db/cat"],
          },
          Image: "sha256:prepared",
        },
        {
          command: "prepare-only",
          containerName: "cat-e2e-preparer",
          imageId: "sha256:prepared",
          releaseIdentity: "release-1",
        },
      );

      const persisted = await readFile(path, "utf8");
      expect(persisted).toContain("sha256:prepared");
      expect(persisted).not.toContain("DATABASE_URL");
      expect(persisted).not.toContain("secret");
      expect(persisted).not.toContain("Config");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
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

  it("preserves no-color semantics without passing conflicting variables to Playwright", () => {
    expect(
      playwrightChildEnvironment({
        FORCE_COLOR: "3",
        NO_COLOR: "1",
        PATH: "/bin",
      }),
    ).toEqual({
      FORCE_COLOR: "0",
      PATH: "/bin",
    });
    expect(
      playwrightChildEnvironment({ FORCE_COLOR: "3", PATH: "/bin" }),
    ).toEqual({
      FORCE_COLOR: "3",
      PATH: "/bin",
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
        write: discardCellOutput,
        writeError: discardCellOutput,
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

  it("does not retry a worker after another worker has failed the matrix", async () => {
    const firstInput = { ...input };
    const secondInput = { ...input };
    let releaseFirstAttempt: (() => void) | undefined;
    const attempts = new Map<ExecutionCellInput, number>();
    const createCell = vi.fn((current: ExecutionCellInput) => {
      const attempt = (attempts.get(current) ?? 0) + 1;
      attempts.set(current, attempt);
      return {
        run: async () => {
          if (current === firstInput && attempt === 1) {
            await new Promise<void>((resolveRun) => {
              releaseFirstAttempt = resolveRun;
            });
            throw new Error("first worker transient");
          }
          if (current === secondInput) {
            throw new Error(
              attempt === 1
                ? "second worker transient"
                : "second worker terminal",
            );
          }
        },
      };
    });

    const scheduled = runExecutionCells([firstInput, secondInput], {
      concurrency: 2,
      createCell,
      retryFailedCells: true,
    });
    await vi.waitFor(() => {
      expect(attempts.get(secondInput)).toBe(2);
      expect(releaseFirstAttempt).toBeDefined();
    });
    releaseFirstAttempt?.();

    await expect(scheduled).rejects.toThrow(
      "Multiple execution cells failed while completing matrix diagnostics",
    );
    expect(attempts.get(firstInput)).toBe(1);
    expect(attempts.get(secondInput)).toBe(2);
  });

  it("does not treat a reused PID as the process it originally started", () => {
    expect(
      processIdentityMatches(
        { command: "node\u0000app", startTime: "10" },
        { command: "node\u0000other", startTime: "11" },
      ),
    ).toBe(false);
  });

  it("cleans a failed probe workspace while retaining cell diagnostics before the next cell", async () => {
    const probeDirectories: string[] = [];
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
      register: (
        label: string,
        disposer: (signal: AbortSignal) => Promise<void>,
      ) => () => void,
    ): Promise<CellRuntime> => {
      const artifactDirectory = await mkdtemp(join(tmpdir(), "cat-e2e-cell-"));
      const probeDirectory = await mkdtemp(join(tmpdir(), "cat-e2e-probe-"));
      probeDirectories.push(probeDirectory);
      const optimizerDirectory = join(probeDirectory, "optimizer-cache");
      await mkdir(optimizerDirectory, { recursive: true });
      await writeFile(join(optimizerDirectory, "state"), "cold");
      register(
        "test probe workspace",
        async () => await rm(probeDirectory, { force: true, recursive: true }),
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
      write: discardCellOutput,
      writeError: discardCellOutput,
    });

    try {
      await expect(failedCell.run()).rejects.toThrow(failure.message);
      expect(stopped).toHaveBeenCalledTimes(2);
      expect(workspaces).toHaveLength(1);
      expect(existsSync(workspaces[0]!)).toBe(true);

      const nextCell = new ExecutionCell(input, {
        createRuntime,
        createTarget: () => target,
        hydrateFixtures: async () => undefined,
        runPlaywright: async () => undefined,
        waitForApplicationBootstrap: async () => undefined,
        write: discardCellOutput,
        writeError: discardCellOutput,
      });
      await nextCell.run();

      expect(workspaces).toHaveLength(2);
      expect(workspaces[1]).not.toBe(workspaces[0]);
      expect(existsSync(workspaces[1]!)).toBe(false);
    } finally {
      await Promise.all(
        [...workspaces, ...probeDirectories].map(
          async (directory) =>
            await rm(directory, { force: true, recursive: true }),
        ),
      );
    }
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
      write: discardCellOutput,
      writeError: discardCellOutput,
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
