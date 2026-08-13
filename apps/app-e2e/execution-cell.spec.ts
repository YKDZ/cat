import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  assertReadiness,
  ExecutionCell,
  DevTargetAdapter,
  developmentRuntimeEnvironment,
  e2eArtifactRootFrom,
  cleanupCellDatabase,
  formatCellDatabaseCleanupDiagnostic,
  formatDockerContainerPhaseFailure,
  isServerErrorDiagnostic,
  parseCellDatabaseName,
  playwrightChildEnvironment,
  playwrightTimeoutMs,
  persistOneShotPreparerAttestation,
  processIdentityMatches,
  runAbortableCommand,
  runExecutionCells,
  StandaloneTargetAdapter,
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

it("keeps the Playwright cell deadline below its verification node budget", () => {
  expect(playwrightTimeoutMs).toBe(10 * 60_000);
  expect(playwrightTimeoutMs).toBeLessThan(40 * 60_000);
});

const rejectedDeferred = <Value>(): {
  promise: Promise<Value>;
  reject: (reason?: unknown) => void;
} => {
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<Value>((_resolve, rejectPromise) => {
    reject = rejectPromise;
  });
  return {
    promise,
    reject: (reason) => reject?.(reason),
  };
};

const testCellDatabaseName = parseCellDatabaseName(
  `cat_e2e_cell_${"0".repeat(32)}`,
);

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
  databaseName: testCellDatabaseName,
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

const readyReport = (profile: "lite" | "production") => ({
  components: {
    bootstrap: { status: "ready" },
    cache: { status: "ready" },
    "database-requirements": { status: "ready" },
    "language-analysis": { status: "ready" },
    postgres: { status: "ready" },
    queue: { status: "ready" },
    ...(profile === "production" ? { redis: { status: "ready" } } : {}),
    runtime: { status: "ready" },
    session: { status: "ready" },
    storage: { status: "ready" },
  },
  profile,
  runtime: {
    cacheBackend: profile === "lite" ? "memory" : "redis",
    queueBackend: profile === "lite" ? "memory" : "redis",
    sessionBackend: profile === "lite" ? "memory" : "redis",
  },
  status: "ready",
});

describe("ExecutionCell scheduler", () => {
  it("places execution-cell diagnostics beneath the configured artifact root", () => {
    expect(
      e2eArtifactRootFrom({
        CAT_E2E_ARTIFACT_ROOT: "/tmp/cat-e2e-run-123",
      }),
    ).toBe("/tmp/cat-e2e-run-123");
  });

  it.each(["lite", "production"] as const)(
    "accepts the canonical %s readiness component identities",
    (profile) => {
      expect(() =>
        assertReadiness(readyReport(profile), profile),
      ).not.toThrow();
    },
  );

  it("includes the failed readiness component response in diagnostics", () => {
    const report = readyReport("lite");
    const failedReport = {
      ...report,
      components: {
        ...report.components,
        "language-analysis": {
          code: "LANGUAGE_ANALYSIS_CONFIGURATION_INVALID",
          status: "failed",
        },
      },
    };

    expect(() => assertReadiness(failedReport, "lite")).toThrow(
      'Readiness component language-analysis is not ready, received {"code":"LANGUAGE_ANALYSIS_CONFIGURATION_INVALID","status":"failed"}',
    );
  });

  it("persists the lease-reachable spaCy endpoint through standalone bootstrap and aggregate startup", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cat-e2e-docker-"));
    const docker = join(directory, "docker");
    const recorder = join(directory, "docker-recorder.mjs");
    const record = join(directory, "docker-arguments");
    const registered: Array<() => Promise<void>> = [];
    try {
      await writeFile(
        recorder,
        [
          'import { appendFileSync } from "node:fs";',
          "const args = process.argv.slice(2);",
          'appendFileSync(process.env.CAT_E2E_DOCKER_ARGUMENTS, JSON.stringify(args) + "\\n");',
          'if (args[0] === "container" && args[1] === "inspect") {',
          '  const container = args.at(-1) ?? "";',
          '  const command = container.endsWith("-prepare") ? "prepare-only" : "bootstrap-only";',
          "  process.stdout.write(JSON.stringify({",
          '    Image: "sha256:standalone",',
          "    Config: {",
          "      Cmd: [command],",
          '      Image: "sha256:standalone",',
          "      Labels: {",
          '        "org.opencontainers.image.description": "CAT standalone application with database preparation",',
          '        "org.opencontainers.image.version": "release-test",',
          "      },",
          "    },",
          "  }));",
          "}",
          'if (args[0] === "start") {',
          '  const container = args.at(-1) ?? "";',
          '  if (container.endsWith("-first")) process.stdout.write(\'{"status":"applied"}\\n\');',
          '  if (container.endsWith("-repeat")) process.stdout.write(\'{"status":"noop"}\\n\');',
          "}",
        ].join("\n"),
      );
      await writeFile(
        docker,
        '#!/bin/sh\nexec node "$CAT_E2E_DOCKER_RECORDER" "$@"\n',
        { mode: 0o755 },
      );
      const runtime = createTestRuntime({
        applicationPort: 4100,
        artifactDirectory: directory,
        databaseUrl: "postgresql://user:password@localhost/cat",
        environment: {
          CAT_E2E_DOCKER_ARGUMENTS: record,
          CAT_E2E_DOCKER_RECORDER: recorder,
          PATH: `${directory}:${process.env.PATH ?? ""}`,
          REDIS_URL: "redis://localhost:6379/0",
          SPACY_SERVER_URL: "http://172.17.0.1:49154",
        },
      });
      const adapter = new StandaloneTargetAdapter(
        "sha256:standalone",
        "chromium",
        (_label, disposer) => {
          registered.push(
            async () => await disposer(new AbortController().signal),
          );
          return () => undefined;
        },
        new AbortController().signal,
      );

      await adapter.bootstrap(runtime);
      await adapter.start(runtime, "validation");

      await vi.waitFor(() => expect(existsSync(record)).toBe(true));
      const invocations = (await readFile(record, "utf8"))
        .trim()
        .split("\n")
        .map((line): string[] => JSON.parse(line));
      const planArgument = (args: string[]): string | undefined => {
        const index = args.findIndex((argument) => argument === "--env");
        const environment = args
          .slice(index + 1)
          .find((argument) => argument.startsWith("CAT_BOOTSTRAP_PLAN="));
        return environment?.slice("CAT_BOOTSTRAP_PLAN=".length);
      };
      const environmentValue = (
        args: string[],
        key: string,
      ): string | undefined => {
        const pairs = args.flatMap((argument, index) =>
          argument === "--env" ? [args[index + 1]] : [],
        );
        return pairs
          .find((pair) => pair?.startsWith(`${key}=`))
          ?.slice(key.length + 1);
      };
      const bootstrapCreates = invocations.filter(
        (args) => args[0] === "create" && args.at(-1) === "bootstrap-only",
      );
      const aggregateCreate = invocations.find(
        (args) => args[0] === "create" && args.at(-1) === "prepare-and-start",
      );

      expect(bootstrapCreates).toHaveLength(2);
      expect(aggregateCreate).toBeDefined();
      const aggregatePlan = planArgument(aggregateCreate!);
      expect(aggregatePlan).toBeDefined();
      expect(bootstrapCreates.map(planArgument)).toEqual([
        aggregatePlan,
        aggregatePlan,
      ]);
      expect(JSON.parse(aggregatePlan!)).toMatchObject({
        operations: expect.arrayContaining([
          expect.objectContaining({
            pluginId: "spacy-language-analyzer",
            value: { serverUrl: "http://172.17.0.1:49154" },
          }),
        ]),
      });
      expect(environmentValue(aggregateCreate!, "SPACY_SERVER_URL")).toBe(
        "http://172.17.0.1:49154",
      );
    } finally {
      await Promise.all(
        registered.map(async (unregister) => await unregister()),
      );
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("validates ordinary Vike page bootstrap before release readiness", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cat-e2e-docker-"));
    const docker = join(directory, "docker");
    const recorder = join(directory, "docker-recorder.mjs");
    const requests: string[] = [];
    const server = createServer((request, response) => {
      requests.push(request.url ?? "");
      if (request.url === "/_health/ready") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(readyReport("production")));
        return;
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<!doctype html><body>ready</body>");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (typeof address === "string" || address === null) {
      throw new Error("Failed to bind release bootstrap test server");
    }
    try {
      await writeFile(
        recorder,
        [
          "const args = process.argv.slice(2);",
          'if (args[0] === "container" && args[1] === "inspect") {',
          "  process.stdout.write(JSON.stringify({",
          '    Image: "sha256:standalone",',
          "    State: { Running: true },",
          "    HostConfig: { PortBindings: { '3000/tcp': [{ HostPort: process.env.CAT_E2E_APPLICATION_PORT }] } },",
          "    Config: {",
          '      Cmd: ["prepare-and-start"],',
          '      Image: "sha256:standalone",',
          '      Env: ["CAT_CACHE_BACKEND=redis","CAT_DIAGNOSTIC_NDJSON=true","CAT_QUEUE_BACKEND=redis","CAT_REDIS_NAMESPACE=cat-e2e:test","CAT_RUNTIME_PROFILE=production","CAT_SESSION_BACKEND=redis","DATABASE_URL=postgresql://user:password@postgresql:5432/cat","PORT=3000","REDIS_URL=redis://redis:6379/0","SPACY_SERVER_URL=http://spacy:8000","CAT_BOOTSTRAP_PLAN={}"],',
          "      Labels: {",
          '        "org.opencontainers.image.description": "CAT standalone application with database preparation",',
          '        "org.opencontainers.image.version": "release-test",',
          "      },",
          "    },",
          '    Mounts: [{ Type: "volume", Name: "cat-e2e-storage", Destination: "/data/storage" }],',
          '    NetworkSettings: { Networks: { "cat-e2e-test_default": {} } },',
          "  }));",
          "}",
          'if (args[0] === "start") {',
          '  process.on("SIGTERM", () => process.exit(0));',
          "  setInterval(() => undefined, 1000);",
          "}",
        ].join("\n"),
      );
      await writeFile(
        docker,
        '#!/bin/sh\nexec node "$CAT_E2E_DOCKER_RECORDER" "$@"\n',
        { mode: 0o755 },
      );
      const runtime = createTestRuntime({
        applicationPort: address.port,
        applicationUrl: `http://127.0.0.1:${address.port}`,
        artifactDirectory: directory,
        databaseUrl: "postgresql://user:password@localhost/cat",
        environment: {
          CAT_E2E_APPLICATION_PORT: String(address.port),
          CAT_E2E_DOCKER_RECORDER: recorder,
          PATH: `${directory}:${process.env.PATH ?? ""}`,
          REDIS_URL: "redis://localhost:6379/0",
          SPACY_SERVER_URL: "http://spacy:8000",
        },
        storageVolumeName: "cat-e2e-storage",
      });
      const adapter = new StandaloneTargetAdapter(
        "sha256:standalone",
        "chromium",
        () => () => undefined,
        new AbortController().signal,
      );
      const started = await adapter.start(runtime, "validation");
      try {
        await adapter.attest(runtime, started);
      } finally {
        started.child.kill("SIGKILL");
      }

      expect(requests.slice(0, 2)).toEqual(["/", "/_health/ready"]);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
      });
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("gates, terminates, drains, and drops a cell database by default", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ activeConnections: 1 }] })
      .mockResolvedValueOnce({ rows: [{ activeConnections: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    const client = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query,
    };
    const databaseName = parseCellDatabaseName(
      `cat_e2e_cell_${"a".repeat(32)}`,
    );
    const states: Array<{
      phase: string;
      primaryFailurePhase?: string;
    }> = [];

    await cleanupCellDatabase(
      "postgresql://example.test/postgres",
      databaseName,
      new AbortController().signal,
      client as never,
      (state) => states.push(state),
    );

    expect(query).toHaveBeenCalledTimes(5);
    expect(query).toHaveBeenNthCalledWith(
      1,
      `ALTER DATABASE "${databaseName}" WITH ALLOW_CONNECTIONS false`,
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [databaseName],
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      'SELECT pg_backend_pid()::integer AS "cleanupBackendPid", count(*)::integer AS "activeConnections" FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [databaseName],
    );
    expect(query).toHaveBeenNthCalledWith(
      4,
      'SELECT pg_backend_pid()::integer AS "cleanupBackendPid", count(*)::integer AS "activeConnections" FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [databaseName],
    );
    expect(query).toHaveBeenNthCalledWith(
      5,
      `DROP DATABASE IF EXISTS "${databaseName}"`,
    );
    expect(client.end).toHaveBeenCalledOnce();
    expect(states.map((state) => state.phase)).toEqual([
      "connect",
      "connection-gate",
      "terminate",
      "drain",
      "drop",
      "close",
      "complete",
    ]);
  });

  it("retires a drained cell database when its lease owns the service volume", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ activeConnections: 0 }] });
    const client = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query,
    };
    const databaseName = parseCellDatabaseName(
      `cat_e2e_cell_${"b".repeat(32)}`,
    );
    const states: Array<{ phase: string }> = [];

    await cleanupCellDatabase(
      "postgresql://example.test/postgres",
      databaseName,
      new AbortController().signal,
      client as never,
      (state) => states.push(state),
      undefined,
      0,
      "lease-volume",
    );

    expect(query).toHaveBeenCalledTimes(3);
    expect(
      query.mock.calls.some(
        ([statement]) =>
          typeof statement === "string" &&
          statement.startsWith("DROP DATABASE"),
      ),
    ).toBe(false);
    expect(states.map((state) => state.phase)).toEqual([
      "connect",
      "connection-gate",
      "terminate",
      "drain",
      "retire",
      "close",
      "complete",
    ]);
    expect(client.end).toHaveBeenCalledOnce();
  });

  it("formats only the allowlisted database drop diagnostic fields", () => {
    const diagnostic = formatCellDatabaseCleanupDiagnostic({
      dropDiagnostic: {
        blockingPids: [7],
        locks: [
          {
            classId: null,
            databaseOid: 12,
            granted: false,
            locktype: "object",
            mode: "AccessExclusiveLock",
            objectId: 12,
            relationOid: null,
          },
        ],
        preparedTransactionCount: 0,
        replicationSlotCount: 0,
        status: "captured",
        waitEvent: "relation",
        waitEventType: "Lock",
      },
      phase: "drop",
      primaryFailurePhase: "drop",
    });

    expect(diagnostic).toContain("phase=drop primaryPhase=drop");
    expect(diagnostic).toContain('"waitEventType":"Lock"');
    expect(diagnostic).not.toMatch(/query|user|address|postgresql/i);
  });

  it("preserves the drain phase when cleanup is aborted while waiting for terminated connections", async () => {
    const controller = new AbortController();
    const abortFailure = new Error("database cleanup timeout");
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValue({ rows: [{ activeConnections: 1 }] });
    const client = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query,
    };
    const states: Array<{
      phase: string;
      primaryFailurePhase?: string;
    }> = [];
    const cleanup = cleanupCellDatabase(
      "postgresql://example.test/postgres",
      parseCellDatabaseName(`cat_e2e_cell_${"9".repeat(32)}`),
      controller.signal,
      client as never,
      (state) => states.push(state),
    );

    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(3));
    controller.abort(abortFailure);

    await expect(cleanup).rejects.toBe(abortFailure);
    expect(states).toContainEqual({ phase: "drain" });
    expect(states.at(-2)).toEqual({
      phase: "drain",
      primaryFailurePhase: "drain",
    });
    expect(states.at(-1)).toEqual({
      phase: "close",
      primaryFailurePhase: "drain",
    });
    expect(
      query.mock.calls.some(
        ([statement]) =>
          typeof statement === "string" &&
          statement.startsWith("DROP DATABASE"),
      ),
    ).toBe(false);
    expect(client.end).toHaveBeenCalledOnce();
  });

  it("refuses to drop when the database cannot report a valid drained connection count", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ activeConnections: "0" }] });
    const client = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query,
    };
    const states: Array<{
      phase: string;
      primaryFailurePhase?: string;
    }> = [];

    await expect(
      cleanupCellDatabase(
        "postgresql://example.test/postgres",
        parseCellDatabaseName(`cat_e2e_cell_${"8".repeat(32)}`),
        new AbortController().signal,
        client as never,
        (state) => states.push(state),
      ),
    ).rejects.toThrow(
      "Database cleanup received an invalid active connection count",
    );

    expect(query).toHaveBeenCalledTimes(3);
    expect(states.at(-2)).toEqual({
      phase: "drain",
      primaryFailurePhase: "drain",
    });
    expect(states.at(-1)).toEqual({
      phase: "close",
      primaryFailurePhase: "drain",
    });
    expect(client.end).toHaveBeenCalledOnce();
  });

  it("preserves a drain failure when closing the cleanup client also fails", async () => {
    const drainFailure = new Error("invalid connection count");
    const closeFailure = new Error("close failed");
    const client = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => {
        throw closeFailure;
      }),
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(drainFailure),
    };
    const states: Array<{
      phase: string;
      primaryFailurePhase?: string;
    }> = [];

    await expect(
      cleanupCellDatabase(
        "postgresql://example.test/postgres",
        parseCellDatabaseName(`cat_e2e_cell_${"7".repeat(32)}`),
        new AbortController().signal,
        client as never,
        (state) => states.push(state),
      ),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof AggregateError)) return false;
      return (
        error.message === "Database cleanup and client close both failed" &&
        error.errors[0] === drainFailure &&
        error.errors[1] === closeFailure
      );
    });

    expect(states.at(-2)).toEqual({
      phase: "drain",
      primaryFailurePhase: "drain",
    });
    expect(states.at(-1)).toEqual({
      phase: "close",
      primaryFailurePhase: "drain",
    });
    expect(client.end).toHaveBeenCalledOnce();
  });

  it("records a sanitized lock snapshot while a database drop is blocked", async () => {
    let resolveDrop: (() => void) | undefined;
    const client = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query: vi.fn(async (statement: string) => {
        if (statement.includes("count(*)")) {
          return { rows: [{ activeConnections: 0, cleanupBackendPid: 42 }] };
        }
        if (statement.startsWith("DROP DATABASE")) {
          await new Promise<void>((resolveDropQuery) => {
            resolveDrop = resolveDropQuery;
          });
        }
        return { rows: [] };
      }),
    };
    const inspector = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query: vi.fn(async (statement: string) => {
        if (statement.startsWith("SELECT oid")) {
          return { rows: [{ databaseOid: "12" }] };
        }
        return {
          rows: [
            {
              blockingPids: [7],
              locks: [
                {
                  classId: null,
                  databaseOid: "12",
                  granted: false,
                  locktype: "object",
                  mode: "AccessExclusiveLock",
                  objectId: "12",
                  relationOid: null,
                  query: "SELECT secret",
                  user: "admin",
                },
              ],
              preparedTransactionCount: 0,
              replicationSlotCount: 0,
              waitEvent: "relation",
              waitEventType: "Lock",
            },
          ],
        };
      }),
    };
    const states: Array<{
      dropDiagnostic?: unknown;
      phase: string;
    }> = [];
    const cleanup = cleanupCellDatabase(
      "postgresql://example.test/postgres",
      parseCellDatabaseName(`cat_e2e_cell_${"6".repeat(32)}`),
      new AbortController().signal,
      client as never,
      (state) => states.push(state),
      inspector as never,
      0,
    );

    await vi.waitFor(() => expect(inspector.query).toHaveBeenCalledTimes(2));
    const snapshot = states.findLast(
      (state) =>
        state.phase === "drop" &&
        typeof state.dropDiagnostic === "object" &&
        state.dropDiagnostic !== null &&
        Reflect.get(state.dropDiagnostic, "status") === "captured",
    )?.dropDiagnostic;

    expect(snapshot).toEqual({
      blockingPids: [7],
      locks: [
        {
          classId: null,
          databaseOid: 12,
          granted: false,
          locktype: "object",
          mode: "AccessExclusiveLock",
          objectId: 12,
          relationOid: null,
        },
      ],
      preparedTransactionCount: 0,
      replicationSlotCount: 0,
      status: "captured",
      waitEvent: "relation",
      waitEventType: "Lock",
    });
    expect(JSON.stringify(snapshot)).not.toContain("secret");
    expect(JSON.stringify(snapshot)).not.toContain("admin");

    resolveDrop?.();
    await expect(cleanup).resolves.toBeUndefined();
    expect(client.end).toHaveBeenCalledOnce();
    expect(inspector.end).toHaveBeenCalledOnce();
  });

  it("closes a preconnected inspector once when an in-flight drop is aborted", async () => {
    const controller = new AbortController();
    const timeout = new Error("database cleanup timeout");
    let resolveDrop: (() => void) | undefined;
    const client = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query: vi.fn(async (statement: string) => {
        if (statement.includes("count(*)")) {
          return { rows: [{ activeConnections: 0, cleanupBackendPid: 42 }] };
        }
        if (statement.startsWith("DROP DATABASE")) {
          await new Promise<void>((resolveDropQuery) => {
            resolveDrop = resolveDropQuery;
          });
        }
        return { rows: [] };
      }),
    };
    const inspector = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query: vi.fn(async () => ({ rows: [] })),
    };
    const cleanup = cleanupCellDatabase(
      "postgresql://example.test/postgres",
      parseCellDatabaseName(`cat_e2e_cell_${"5".repeat(32)}`),
      controller.signal,
      client as never,
      () => undefined,
      inspector as never,
    );

    await vi.waitFor(() => expect(resolveDrop).toBeTypeOf("function"));
    controller.abort(timeout);
    resolveDrop?.();

    await expect(cleanup).rejects.toBe(timeout);
    expect(client.end).toHaveBeenCalledOnce();
    expect(inspector.end).toHaveBeenCalledOnce();
  });

  it("continues cleanup and closes an inspector whose connection failed", async () => {
    const inspectorFailure = Object.assign(
      new Error("inspector connection failed with secrets=not-for-diagnostics"),
      { code: "08001" },
    );
    const client = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query: vi.fn(async (statement: string) => {
        if (statement.includes("count(*)")) {
          return { rows: [{ activeConnections: 0, cleanupBackendPid: 42 }] };
        }
        return { rows: [] };
      }),
    };
    const inspector = {
      connect: vi.fn(async () => {
        throw inspectorFailure;
      }),
      end: vi.fn(async () => undefined),
      query: vi.fn(async () => ({ rows: [] })),
    };
    const states: Array<{ dropDiagnostic?: unknown; phase: string }> = [];

    await expect(
      cleanupCellDatabase(
        "postgresql://example.test/postgres",
        parseCellDatabaseName(`cat_e2e_cell_${"4".repeat(32)}`),
        new AbortController().signal,
        client as never,
        (state) => states.push(state),
        inspector as never,
      ),
    ).resolves.toBeUndefined();

    expect(states).toContainEqual({
      dropDiagnostic: {
        category: "connection",
        code: "08001",
        status: "unavailable",
      },
      phase: "drop",
    });
    expect(JSON.stringify(states)).not.toContain("secrets");
    expect(client.end).toHaveBeenCalledOnce();
    expect(inspector.end).toHaveBeenCalledOnce();
  });

  it("caches only the safe SQLSTATE when snapshot sampling fails", async () => {
    let resolveDrop: (() => void) | undefined;
    const client = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query: vi.fn(async (statement: string) => {
        if (statement.includes("count(*)")) {
          return { rows: [{ activeConnections: 0, cleanupBackendPid: 42 }] };
        }
        if (statement.startsWith("DROP DATABASE")) {
          await new Promise<void>((resolveDropQuery) => {
            resolveDrop = resolveDropQuery;
          });
        }
        return { rows: [] };
      }),
    };
    const inspector = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query: vi.fn(async (statement: string) => {
        if (statement.startsWith("SELECT oid")) {
          return { rows: [{ databaseOid: "12" }] };
        }
        throw Object.assign(
          new Error("operator does not exist: name = integer; password=secret"),
          { code: "42883" },
        );
      }),
    };
    const states: Array<{ dropDiagnostic?: unknown; phase: string }> = [];
    const cleanup = cleanupCellDatabase(
      "postgresql://example.test/postgres",
      parseCellDatabaseName(`cat_e2e_cell_${"3".repeat(32)}`),
      new AbortController().signal,
      client as never,
      (state) => states.push(state),
      inspector as never,
      0,
    );

    await vi.waitFor(() =>
      expect(states).toContainEqual({
        dropDiagnostic: {
          category: "query",
          code: "42883",
          status: "unavailable",
        },
        phase: "drop",
      }),
    );
    expect(JSON.stringify(states)).not.toContain("password");

    resolveDrop?.();
    await expect(cleanup).resolves.toBeUndefined();
  });

  it("does not let a non-settling inspector connection delay a cell drop", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("count(*)")) {
        return { rows: [{ activeConnections: 0, cleanupBackendPid: 42 }] };
      }
      return { rows: [] };
    });
    const client = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query,
    };
    const inspector = {
      connect: vi.fn(async () => await new Promise<void>(() => undefined)),
      end: vi.fn(async () => undefined),
      query: vi.fn(async () => ({ rows: [] })),
    };

    await expect(
      cleanupCellDatabase(
        "postgresql://example.test/postgres",
        parseCellDatabaseName(`cat_e2e_cell_${"2".repeat(32)}`),
        new AbortController().signal,
        client as never,
        () => undefined,
        inspector as never,
        0,
        "cell-drop",
        0,
      ),
    ).resolves.toBeUndefined();

    expect(
      query.mock.calls.some(
        ([statement]) =>
          typeof statement === "string" &&
          statement.startsWith("DROP DATABASE"),
      ),
    ).toBe(true);
    expect(inspector.query).not.toHaveBeenCalled();
    expect(inspector.end).toHaveBeenCalledOnce();
  });

  it("does not let non-settling diagnostic setup delay a cell drop", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("count(*)")) {
        return { rows: [{ activeConnections: 0, cleanupBackendPid: 42 }] };
      }
      return { rows: [] };
    });
    const client = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query,
    };
    const inspector = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query: vi.fn(async () => await new Promise<void>(() => undefined)),
    };

    await expect(
      cleanupCellDatabase(
        "postgresql://example.test/postgres",
        parseCellDatabaseName(`cat_e2e_cell_${"1".repeat(32)}`),
        new AbortController().signal,
        client as never,
        () => undefined,
        inspector as never,
        0,
        "cell-drop",
        0,
      ),
    ).resolves.toBeUndefined();

    expect(
      query.mock.calls.some(
        ([statement]) =>
          typeof statement === "string" &&
          statement.startsWith("DROP DATABASE"),
      ),
    ).toBe(true);
    expect(inspector.end).toHaveBeenCalledOnce();
  });

  it("does not wait for a snapshot after a fast cell drop", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("count(*)")) {
        return { rows: [{ activeConnections: 0, cleanupBackendPid: 42 }] };
      }
      if (statement.startsWith("DROP DATABASE")) {
        await new Promise<void>((resolveDrop) => setTimeout(resolveDrop, 0));
      }
      return { rows: [] };
    });
    const client = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query,
    };
    const inspector = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query: vi.fn(async (statement: string) => {
        if (statement.startsWith("SELECT oid")) {
          return { rows: [{ databaseOid: "12" }] };
        }
        return await new Promise<void>(() => undefined);
      }),
    };

    await expect(
      cleanupCellDatabase(
        "postgresql://example.test/postgres",
        parseCellDatabaseName(`cat_e2e_cell_${"0".repeat(32)}`),
        new AbortController().signal,
        client as never,
        () => undefined,
        inspector as never,
        0,
        "cell-drop",
        0,
      ),
    ).resolves.toBeUndefined();

    expect(inspector.query).toHaveBeenCalledTimes(2);
    expect(inspector.end).toHaveBeenCalledOnce();
  });

  it("does not let a non-settling inspector close delay a cell drop", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("count(*)")) {
        return { rows: [{ activeConnections: 0, cleanupBackendPid: 42 }] };
      }
      return { rows: [] };
    });
    const client = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query,
    };
    const inspector = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => await new Promise<void>(() => undefined)),
      query: vi.fn(async () => ({ rows: [{ databaseOid: "12" }] })),
    };

    await expect(
      cleanupCellDatabase(
        "postgresql://example.test/postgres",
        parseCellDatabaseName(`cat_e2e_cell_${"f".repeat(32)}`),
        new AbortController().signal,
        client as never,
        () => undefined,
        inspector as never,
        10_000,
        "cell-drop",
        0,
      ),
    ).resolves.toBeUndefined();

    expect(
      query.mock.calls.some(
        ([statement]) =>
          typeof statement === "string" &&
          statement.startsWith("DROP DATABASE"),
      ),
    ).toBe(true);
    expect(inspector.end).toHaveBeenCalledOnce();
  });

  it("observes late diagnostic rejections after their short budgets expire", async () => {
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", onUnhandledRejection);
    const rejectedConnect = rejectedDeferred<void>();
    const rejectedSetup = rejectedDeferred<{
      rows: Array<{ databaseOid: string }>;
    }>();
    const rejectedEnd = rejectedDeferred<void>();
    const rejectedCapture = rejectedDeferred<{
      rows: Array<Record<string, unknown>>;
    }>();
    const createClient = () => ({
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query: vi.fn(async (statement: string) => {
        if (statement.includes("count(*)")) {
          return { rows: [{ activeConnections: 0, cleanupBackendPid: 42 }] };
        }
        return { rows: [] };
      }),
    });
    try {
      const connectClient = createClient();
      await cleanupCellDatabase(
        "postgresql://example.test/postgres",
        parseCellDatabaseName(`cat_e2e_cell_${"a".repeat(32)}`),
        new AbortController().signal,
        connectClient as never,
        () => undefined,
        {
          connect: vi.fn(async () => await rejectedConnect.promise),
          end: vi.fn(async () => undefined),
          query: vi.fn(async () => ({ rows: [] })),
        } as never,
        10_000,
        "cell-drop",
        0,
      );
      rejectedConnect.reject(new Error("late inspector connect rejection"));

      const setupClient = createClient();
      await cleanupCellDatabase(
        "postgresql://example.test/postgres",
        parseCellDatabaseName(`cat_e2e_cell_${"b".repeat(32)}`),
        new AbortController().signal,
        setupClient as never,
        () => undefined,
        {
          connect: vi.fn(async () => undefined),
          end: vi.fn(async () => undefined),
          query: vi.fn(async () => await rejectedSetup.promise),
        } as never,
        10_000,
        "cell-drop",
        0,
      );
      rejectedSetup.reject(new Error("late diagnostic setup rejection"));

      const endClient = createClient();
      await cleanupCellDatabase(
        "postgresql://example.test/postgres",
        parseCellDatabaseName(`cat_e2e_cell_${"c".repeat(32)}`),
        new AbortController().signal,
        endClient as never,
        () => undefined,
        {
          connect: vi.fn(async () => undefined),
          end: vi.fn(async () => await rejectedEnd.promise),
          query: vi.fn(async () => ({ rows: [{ databaseOid: "12" }] })),
        } as never,
        10_000,
        "cell-drop",
        0,
      );
      rejectedEnd.reject(new Error("late inspector close rejection"));

      const captureClient = {
        connect: vi.fn(async () => undefined),
        end: vi.fn(async () => undefined),
        query: vi.fn(async (statement: string) => {
          if (statement.includes("count(*)")) {
            return {
              rows: [{ activeConnections: 0, cleanupBackendPid: 42 }],
            };
          }
          if (statement.startsWith("DROP DATABASE")) {
            await new Promise<void>((resolveDrop) =>
              setTimeout(resolveDrop, 0),
            );
          }
          return { rows: [] };
        }),
      };
      const captureInspector = {
        connect: vi.fn(async () => undefined),
        end: vi.fn(async () => undefined),
        query: vi.fn(async (statement: string) =>
          statement.startsWith("SELECT oid")
            ? { rows: [{ databaseOid: "12" }] }
            : await rejectedCapture.promise,
        ),
      };
      await cleanupCellDatabase(
        "postgresql://example.test/postgres",
        parseCellDatabaseName(`cat_e2e_cell_${"d".repeat(32)}`),
        new AbortController().signal,
        captureClient as never,
        () => undefined,
        captureInspector as never,
        0,
        "cell-drop",
        0,
      );
      expect(captureInspector.query).toHaveBeenCalledTimes(2);
      rejectedCapture.reject(new Error("late diagnostic capture rejection"));

      await new Promise<void>((resolveWait) => setImmediate(resolveWait));
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it.each([
    "postgres",
    "admin",
    "cat_e2e_cell_ordinary",
    "cat_e2e_cell_0123456789abcdef0123456789abcdeg",
    'cat_e2e_cell_0123456789abcdef0123456789abcde"',
  ])(
    "refuses to connect before dropping an unowned database %s",
    async (name) => {
      const client = {
        connect: vi.fn(async () => undefined),
        end: vi.fn(async () => undefined),
        query: vi.fn(async () => ({ rows: [] })),
      };

      expect(() => parseCellDatabaseName(name)).toThrow(
        "Refusing to drop a database that is not owned by an E2E cell",
      );
      await expect(
        cleanupCellDatabase(
          "postgresql://example.test/postgres",
          name as never,
          new AbortController().signal,
          client as never,
        ),
      ).rejects.toThrow(
        "Refusing to drop a database that is not owned by an E2E cell",
      );

      expect(client.connect).not.toHaveBeenCalled();
      expect(client.query).not.toHaveBeenCalled();
      expect(client.end).not.toHaveBeenCalled();
    },
  );

  it("treats a missing cell database as an idempotent cleanup success", async () => {
    const missing = Object.assign(new Error("database does not exist"), {
      code: "3D000",
    });
    const query = vi.fn(async () => {
      throw missing;
    });
    const client = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query,
    };

    await expect(
      cleanupCellDatabase(
        "postgresql://example.test/postgres",
        parseCellDatabaseName(`cat_e2e_cell_${"b".repeat(32)}`),
        new AbortController().signal,
        client as never,
      ),
    ).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledOnce();
    expect(client.end).toHaveBeenCalledOnce();
  });

  it("preserves a query failure when closing the cleanup client also fails", async () => {
    const queryFailure = new Error("drop query failed");
    const closeFailure = new Error("close failed");
    const client = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => {
        throw closeFailure;
      }),
      query: vi.fn(async () => {
        throw queryFailure;
      }),
    };

    await expect(
      cleanupCellDatabase(
        "postgresql://example.test/postgres",
        parseCellDatabaseName(`cat_e2e_cell_${"c".repeat(32)}`),
        new AbortController().signal,
        client as never,
      ),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof AggregateError)) return false;
      return (
        error.message === "Database cleanup and client close both failed" &&
        error.errors[0] === queryFailure &&
        error.errors[1] === closeFailure
      );
    });

    expect(client.end).toHaveBeenCalledOnce();
  });

  it("preserves an abort failure when closing the cleanup client also fails", async () => {
    const controller = new AbortController();
    const abortFailure = new Error("database cleanup timeout");
    const closeFailure = new Error("close failed");
    let completeConnect: (() => void) | undefined;
    const client = {
      connect: vi.fn(
        async () =>
          await new Promise<void>((resolveConnect) => {
            completeConnect = resolveConnect;
          }),
      ),
      end: vi.fn(async () => {
        throw closeFailure;
      }),
      query: vi.fn(async () => ({ rows: [] })),
    };
    const cleanup = cleanupCellDatabase(
      "postgresql://example.test/postgres",
      parseCellDatabaseName(`cat_e2e_cell_${"d".repeat(32)}`),
      controller.signal,
      client as never,
    );

    await vi.waitFor(() => expect(client.connect).toHaveBeenCalledOnce());
    controller.abort(abortFailure);
    completeConnect?.();

    await expect(cleanup).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof AggregateError)) return false;
      return (
        error.message === "Database cleanup and client close both failed" &&
        error.errors[0] === abortFailure &&
        error.errors[1] === closeFailure
      );
    });

    expect(client.query).not.toHaveBeenCalled();
    expect(client.end).toHaveBeenCalledOnce();
  });

  it("closes a database cleanup client only once when abort races its final drop", async () => {
    const controller = new AbortController();
    const timeout = new Error("database cleanup timeout");
    let completeDrop: (() => void) | undefined;
    const query = vi.fn(async (statement: string) => {
      if (statement.startsWith("DROP DATABASE")) {
        await new Promise<void>((resolveDrop) => {
          completeDrop = resolveDrop;
        });
      }
      if (statement.includes("count(*)")) {
        return { rows: [{ activeConnections: 0 }] };
      }
      return { rows: [] };
    });
    const client = {
      connect: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      query,
    };
    const cleanup = cleanupCellDatabase(
      "postgresql://example.test/postgres",
      parseCellDatabaseName(`cat_e2e_cell_${"e".repeat(32)}`),
      controller.signal,
      client as never,
    );

    await vi.waitFor(() => expect(completeDrop).toBeTypeOf("function"));
    controller.abort(timeout);
    completeDrop?.();
    await expect(cleanup).rejects.toBe(timeout);

    expect(query).toHaveBeenNthCalledWith(
      4,
      `DROP DATABASE IF EXISTS "cat_e2e_cell_${"e".repeat(32)}"`,
    );
    expect(client.end).toHaveBeenCalledTimes(1);
  });

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

  it("keeps the failed database cleanup phase after closing its client", async () => {
    const artifactDirectory = await mkdtemp(join(tmpdir(), "cat-e2e-cell-"));
    const errors: string[] = [];
    const databaseName = parseCellDatabaseName(
      `cat_e2e_cell_${"f".repeat(32)}`,
    );
    const dropFailure = new Error("drop query failed");
    const query = vi.fn(async (statement: string) => {
      if (statement.startsWith("DROP DATABASE")) throw dropFailure;
      if (statement.includes("count(*)")) {
        return { rows: [{ activeConnections: 0 }] };
      }
      return { rows: [] };
    });
    let diagnostic = "phase=connect";

    try {
      await expect(
        new ExecutionCell(input, {
          createRuntime: async (register) => {
            register(
              "cell database",
              async (signal) =>
                await cleanupCellDatabase(
                  "postgresql://example.test/postgres",
                  databaseName,
                  signal,
                  {
                    connect: async () => undefined,
                    end: async () => undefined,
                    query,
                  } as never,
                  (state) => {
                    diagnostic = `phase=${state.phase}${
                      state.primaryFailurePhase === undefined
                        ? ""
                        : ` primaryPhase=${state.primaryFailurePhase}`
                    }`;
                  },
                ),
              () => diagnostic,
            );
            return createTestRuntime({ artifactDirectory });
          },
          createTarget: () => ({
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
          }),
          hydrateFixtures: async () => undefined,
          runPlaywright: async () => undefined,
          write: discardCellOutput,
          writeError: (message) => errors.push(message),
        }).run(),
      ).rejects.toThrow("Execution cell cleanup failed");

      expect(query).toHaveBeenLastCalledWith(
        `DROP DATABASE IF EXISTS "${databaseName}"`,
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("phase=close primaryPhase=drop");
      expect(errors[0]).toContain("drop query failed");
    } finally {
      await rm(artifactDirectory, { force: true, recursive: true });
    }
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
          register(
            "slow test resource",
            async (signal) => {
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
            },
            () => "phase=drop",
          );
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
        "e2e cleanup label=slow test resource status=timed-out duration=10ms phase=drop waiting=resource-settlement",
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

  it("does not report a force-stop failure when a detached process group exits during the grace period", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cat-e2e-process-group-"));
    const marker = join(directory, "pids");
    const grandchildMarker = join(directory, "grandchild");
    const controller = new AbortController();
    let pids: number[] = [];
    const grandchild = [
      "const fs = require('node:fs');",
      "fs.writeFileSync(process.argv[1], String(process.pid));",
      "process.on('SIGTERM', () => setTimeout(() => process.exit(0), 10));",
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
        "cooperative inherited process group",
        {
          signal: controller.signal,
          stdio: "inherit",
          terminationGraceMs: 100,
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
      const stopReason = new Error("stop cooperative process group");
      controller.abort(stopReason);

      await expect(running).rejects.toBe(stopReason);
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
        await new Promise<void>((_resolveRun, rejectRun) => {
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
      databaseName: testCellDatabaseName,
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
        databaseName: testCellDatabaseName,
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
      databaseName: testCellDatabaseName,
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
