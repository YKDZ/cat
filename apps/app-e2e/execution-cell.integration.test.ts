import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  captureCellDatabaseDropDiagnostic,
  cleanupCellDatabase,
  executionCellCleanupSettlementTimeoutMs,
  executionCellCleanupTimeoutMs,
  parseCellDatabaseName,
} from "./execution-cell.ts";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const diagnosticLockOidKeys = [
  "classId",
  "databaseOid",
  "objectId",
  "relationOid",
] as const;
const recoveryOperationTimeoutMs = 5_000;
const databaseRecoveryOperationCount = 5;
const databaseRecoveryMaximumMs =
  recoveryOperationTimeoutMs * databaseRecoveryOperationCount;
const databaseCleanupIntegrationTestMarginMs = 5_000;
const databaseCleanupIntegrationTestTimeoutMs =
  executionCellCleanupTimeoutMs +
  executionCellCleanupSettlementTimeoutMs +
  recoveryOperationTimeoutMs +
  databaseRecoveryMaximumMs +
  recoveryOperationTimeoutMs +
  databaseRecoveryMaximumMs +
  databaseCleanupIntegrationTestMarginMs;

type RecoveryClient = {
  connect: () => Promise<unknown>;
  query: (query: string) => Promise<unknown>;
  end: () => Promise<void>;
};

type CloseableClient = Pick<RecoveryClient, "end">;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const createCellDatabase = async (
  adminUrl: string,
): Promise<{
  databaseName: ReturnType<typeof parseCellDatabaseName>;
  databaseUrl: string;
}> => {
  const databaseName = parseCellDatabaseName(
    `cat_e2e_cell_${randomUUID().replaceAll("-", "")}`,
  );
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await client.end();
  }
  return { databaseName, databaseUrl: databaseUrl.toString() };
};

const runRecoveryOperation = async <Result>(
  label: string,
  operation: () => Promise<Result>,
  cancel: () => void,
  timeoutMs = recoveryOperationTimeoutMs,
): Promise<Result> => {
  type Outcome =
    | { status: "fulfilled"; value: Result }
    | { error: unknown; status: "rejected" };
  let complete: ((result: Outcome) => void) | undefined;
  const outcome = new Promise<Outcome>((resolveOutcome) => {
    complete = resolveOutcome;
  });
  let settled = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const settle = (result: Outcome): void => {
    if (settled) return;
    settled = true;
    if (timeout !== undefined) clearTimeout(timeout);
    complete?.(result);
  };
  const operationPromise = Promise.resolve().then(operation);
  void operationPromise
    .then((value) => settle({ status: "fulfilled", value }))
    .catch((error: unknown) => settle({ status: "rejected", error }));
  timeout = setTimeout(() => {
    void Promise.resolve()
      .then(cancel)
      .catch(() => undefined);
    settle({
      status: "rejected",
      error: new Error(`Cell database recovery ${label} timed out`),
    });
  }, timeoutMs);
  const result = await outcome;
  if (result.status === "rejected") throw result.error;
  return result.value;
};

const closeClient = async (
  client: CloseableClient | undefined,
  timeoutMs = recoveryOperationTimeoutMs,
): Promise<void> => {
  if (client === undefined) return;
  await runRecoveryOperation(
    "active client close",
    async () => await client.end(),
    () => undefined,
    timeoutMs,
  );
};

const cellDatabaseConnectionAllowed = async (
  adminUrl: string,
  databaseName: string,
): Promise<boolean | undefined> => {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const result = await client.query<{ allowConnections: boolean }>(
      'SELECT datallowconn AS "allowConnections" FROM pg_database WHERE datname = $1',
      [databaseName],
    );
    return result.rows[0]?.allowConnections;
  } finally {
    await client.end();
  }
};

const quoteIdentifier = (value: string): string =>
  `"${value.replaceAll('"', '""')}"`;

const recoverCellDatabase = async (
  adminUrl: string,
  databaseName: ReturnType<typeof parseCellDatabaseName>,
  client: RecoveryClient = new Client({
    connectionString: adminUrl,
    connectionTimeoutMillis: recoveryOperationTimeoutMs,
  }),
  timeoutMs = recoveryOperationTimeoutMs,
): Promise<void> => {
  let ending: Promise<void> | undefined;
  const end = (): Promise<void> => {
    ending ??= Promise.resolve().then(async () => await client.end());
    return ending;
  };
  const cancel = (): void => {
    void end().catch(() => undefined);
  };
  let primaryFailure: unknown;
  try {
    await runRecoveryOperation(
      "connect",
      async () => await client.connect(),
      cancel,
      timeoutMs,
    );
    await runRecoveryOperation(
      "lock timeout setup",
      async () => await client.query("SET lock_timeout = '1s'"),
      cancel,
      timeoutMs,
    );
    await runRecoveryOperation(
      "statement timeout setup",
      async () => await client.query("SET statement_timeout = '4s'"),
      cancel,
      timeoutMs,
    );
    await runRecoveryOperation(
      "drop",
      async () =>
        await client.query(
          `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`,
        ),
      cancel,
      timeoutMs,
    );
  } catch (error) {
    primaryFailure = error;
  }
  let closeFailure: unknown;
  try {
    await runRecoveryOperation("close", end, () => undefined, timeoutMs);
  } catch (error) {
    closeFailure = error;
  }
  if (primaryFailure !== undefined && closeFailure !== undefined) {
    throw new AggregateError(
      [primaryFailure, closeFailure],
      "Cell database recovery and client close both failed",
    );
  }
  if (primaryFailure !== undefined) throw primaryFailure;
  if (closeFailure !== undefined) throw closeFailure;
};

type CellDatabaseCleanupRecoveryActions = {
  cleanup: (signal: AbortSignal) => Promise<void>;
  cleanupSettlementTimeoutMs?: number;
  cleanupTimeoutMs?: number;
  closeActiveClient: () => Promise<void>;
  recover: () => Promise<void>;
};

const cleanupCellDatabaseWithRecovery = async ({
  cleanup,
  cleanupSettlementTimeoutMs = executionCellCleanupSettlementTimeoutMs,
  cleanupTimeoutMs = recoveryOperationTimeoutMs,
  closeActiveClient,
  recover,
}: CellDatabaseCleanupRecoveryActions): Promise<void> => {
  const cleanupController = new AbortController();
  let cleanupAttempt: Promise<void> | undefined;
  let primaryFailure: unknown;
  let cleanupVerified = false;
  try {
    await runRecoveryOperation(
      "cleanup",
      async () => {
        cleanupAttempt = cleanup(cleanupController.signal);
        await cleanupAttempt;
      },
      () => cleanupController.abort(),
      cleanupTimeoutMs,
    );
    cleanupVerified = true;
  } catch (error) {
    primaryFailure = error;
  }
  if (
    primaryFailure !== undefined &&
    cleanupController.signal.aborted &&
    cleanupAttempt !== undefined
  ) {
    const attemptToSettle = cleanupAttempt;
    try {
      await runRecoveryOperation(
        "cleanup settlement",
        async () => {
          await attemptToSettle.then(
            () => undefined,
            () => undefined,
          );
        },
        () => undefined,
        cleanupSettlementTimeoutMs,
      );
    } catch (settlementError) {
      primaryFailure = new AggregateError(
        [primaryFailure, settlementError],
        "Cell database cleanup timed out and did not settle after cancellation",
      );
    }
  }

  let closeFailure: unknown;
  try {
    await closeActiveClient();
  } catch (error) {
    closeFailure = error;
  }

  let recoveryFailure: unknown;
  if (!cleanupVerified) {
    try {
      await recover();
    } catch (error) {
      recoveryFailure = error;
    }
  }

  const failures = [primaryFailure, closeFailure, recoveryFailure].filter(
    (failure): failure is NonNullable<typeof failure> => failure !== undefined,
  );
  if (failures.length === 0) return;
  if (failures.length === 1) throw failures[0];
  throw new AggregateError(
    failures,
    "Cell database cleanup, active client close, and recovery failed",
  );
};

describe.skipIf(testDatabaseUrl === undefined)(
  "Execution cell PostgreSQL diagnostics",
  () => {
    it("executes the drop snapshot query against the leased PostgreSQL 18 service", async () => {
      if (testDatabaseUrl === undefined) {
        throw new Error(
          "TEST_DATABASE_URL is required for this integration test",
        );
      }
      const client = new Client({ connectionString: testDatabaseUrl });
      await client.connect();
      try {
        const result = await client.query<{
          databaseOid: string;
          pid: number;
        }>(
          'SELECT pg_backend_pid() AS "pid", (SELECT oid FROM pg_database WHERE datname = current_database())::text AS "databaseOid"',
        );
        const row = result.rows[0];
        if (row === undefined) {
          throw new Error(
            "Could not inspect the PostgreSQL diagnostic backend",
          );
        }
        const databaseOid = Number(row.databaseOid);
        expect(Number.isSafeInteger(databaseOid)).toBe(true);

        const rawLocksResult = await client.query<{ locks: unknown }>(`SELECT
          COALESCE(json_agg(json_build_object(
            'databaseOid', lock.database::text,
            'relationOid', lock.relation::text,
            'classId', lock.classid::text,
            'objectId', lock.objid::text
          )), '[]'::json) AS locks
        FROM pg_locks AS lock
        WHERE lock.pid = pg_backend_pid()`);
        const rawLocks = rawLocksResult.rows[0]?.locks;
        if (!Array.isArray(rawLocks) || rawLocks.length === 0) {
          throw new Error(
            "Expected the PostgreSQL diagnostic backend to hold a lock",
          );
        }
        for (const lock of rawLocks) {
          if (!isRecord(lock)) {
            throw new Error(
              "PostgreSQL diagnostic lock projection was invalid",
            );
          }
          for (const key of diagnosticLockOidKeys) {
            const value = lock[key];
            expect(value === null || typeof value === "string").toBe(true);
          }
        }

        const snapshot = await captureCellDatabaseDropDiagnostic(
          client,
          parseCellDatabaseName(`cat_e2e_cell_${"1".repeat(32)}`),
          row.pid,
          databaseOid,
        );

        expect(snapshot.status).toBe("captured");
        if (snapshot.status !== "captured") {
          throw new Error("PostgreSQL drop snapshot was not captured");
        }
        expect(snapshot.locks.length).toBeGreaterThan(0);
        for (const lock of snapshot.locks) {
          for (const key of diagnosticLockOidKeys) {
            const value = lock[key];
            expect(value === null || typeof value === "number").toBe(true);
          }
        }
        expect(snapshot).toMatchObject({
          preparedTransactionCount: expect.any(Number),
          replicationSlotCount: expect.any(Number),
        });
      } finally {
        await client.end();
      }
    });
  },
);

describe("Execution cell recovery failure handling", () => {
  it("waits for cooperative cleanup settlement before closing and recovering", async () => {
    const events: string[] = [];
    const closeActiveClient = vi.fn(async (): Promise<void> => {
      events.push("close");
    });
    const recover = vi.fn(async (): Promise<void> => {
      events.push("recover");
    });

    const failure = await cleanupCellDatabaseWithRecovery({
      cleanup: async (signal): Promise<void> =>
        await new Promise<void>((_resolve, reject) => {
          events.push("cleanup");
          signal.addEventListener(
            "abort",
            () => {
              events.push("abort");
              setTimeout(() => {
                events.push("settled");
                reject(signal.reason);
              }, 5);
            },
            { once: true },
          );
        }),
      cleanupSettlementTimeoutMs: 50,
      cleanupTimeoutMs: 10,
      closeActiveClient,
      recover,
    }).catch((error: unknown) => error);

    expect(events).toEqual(["cleanup", "abort", "settled", "close", "recover"]);
    expect(closeActiveClient).toHaveBeenCalledOnce();
    expect(recover).toHaveBeenCalledOnce();
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "Cell database recovery cleanup timed out",
    );
  });

  it("reports a hard timeout, performs recovery, and observes a late cleanup rejection", async () => {
    let rejectCleanup: ((reason?: unknown) => void) | undefined;
    const events: string[] = [];
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", onUnhandledRejection);
    try {
      const failure = await cleanupCellDatabaseWithRecovery({
        cleanup: async (signal): Promise<void> =>
          await new Promise<void>((_resolve, reject) => {
            rejectCleanup = reject;
            signal.addEventListener("abort", () => events.push("abort"), {
              once: true,
            });
          }),
        cleanupSettlementTimeoutMs: 10,
        cleanupTimeoutMs: 10,
        closeActiveClient: async (): Promise<void> => {
          events.push("close");
        },
        recover: async (): Promise<void> => {
          events.push("recover");
        },
      }).catch((error: unknown) => error);

      expect(events).toEqual(["abort", "close", "recover"]);
      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).errors).toEqual([
        expect.objectContaining({
          message: "Cell database recovery cleanup timed out",
        }),
        expect.objectContaining({
          message: "Cell database recovery cleanup settlement timed out",
        }),
      ]);

      rejectCleanup?.(new Error("late cleanup rejection"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("runs recovery after an active-client close timeout and preserves failure order", async () => {
    const cleanupFailure = new Error("cleanup failed");
    const recoveryFailure = new Error("recovery failed");
    let rejectClose: ((reason?: unknown) => void) | undefined;
    const close = new Promise<void>((_resolve, reject) => {
      rejectClose = reject;
    });
    const recover = vi.fn(async (): Promise<void> => {
      throw recoveryFailure;
    });
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", onUnhandledRejection);
    try {
      const failure = await cleanupCellDatabaseWithRecovery({
        cleanup: async (): Promise<void> => {
          throw cleanupFailure;
        },
        closeActiveClient: async (): Promise<void> =>
          await closeClient(
            {
              end: () => close,
            },
            10,
          ),
        recover,
      }).catch((error: unknown) => error);

      expect(recover).toHaveBeenCalledOnce();
      expect(failure).toBeInstanceOf(AggregateError);
      const errors = (failure as AggregateError).errors;
      expect(errors).toHaveLength(3);
      expect(errors[0]).toBe(cleanupFailure);
      expect(errors[1]).toBeInstanceOf(Error);
      expect((errors[1] as Error).message).toBe(
        "Cell database recovery active client close timed out",
      );
      expect(errors[2]).toBe(recoveryFailure);

      rejectClose?.(new Error("late active client close failure"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("preserves a recovery operation failure before a bounded close failure", async () => {
    const connectFailure = new Error("recovery connect failed");
    let endCalls = 0;
    const client: RecoveryClient = {
      connect: async (): Promise<void> => {
        throw connectFailure;
      },
      query: async (): Promise<unknown> => undefined,
      end: (): Promise<void> => {
        endCalls += 1;
        return new Promise(() => undefined);
      },
    };

    const failure = await recoverCellDatabase(
      "postgresql://unused",
      parseCellDatabaseName(`cat_e2e_cell_${"1".repeat(32)}`),
      client,
      10,
    ).catch((error: unknown) => error);

    expect(endCalls).toBe(1);
    expect(failure).toBeInstanceOf(AggregateError);
    const errors = (failure as AggregateError).errors;
    expect(errors).toHaveLength(2);
    expect(errors[0]).toBe(connectFailure);
    expect(errors[1]).toBeInstanceOf(Error);
    expect((errors[1] as Error).message).toBe(
      "Cell database recovery close timed out",
    );
  });

  it("observes a late recovery close rejection after its bounded timeout", async () => {
    let rejectEnd: ((reason?: unknown) => void) | undefined;
    const end = new Promise<void>((_resolve, reject) => {
      rejectEnd = reject;
    });
    const client: RecoveryClient = {
      connect: async (): Promise<void> => undefined,
      query: async (): Promise<unknown> => undefined,
      end: () => end,
    };
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", onUnhandledRejection);
    try {
      await expect(
        recoverCellDatabase(
          "postgresql://unused",
          parseCellDatabaseName(`cat_e2e_cell_${"2".repeat(32)}`),
          client,
          10,
        ),
      ).rejects.toThrow("Cell database recovery close timed out");

      rejectEnd?.(new Error("late recovery close failure"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });
});

describe.skipIf(testDatabaseUrl === undefined)(
  "Execution cell database cleanup",
  () => {
    it(
      "uses default cell-drop cleanup to terminate an active connection and delete its database",
      async () => {
        if (testDatabaseUrl === undefined) {
          throw new Error(
            "TEST_DATABASE_URL is required for this integration test",
          );
        }
        const { databaseName, databaseUrl } =
          await createCellDatabase(testDatabaseUrl);
        let activeClient: Client | undefined;
        let primaryFailure: unknown;
        try {
          await cleanupCellDatabaseWithRecovery({
            cleanup: async (signal): Promise<void> => {
              activeClient = new Client({ connectionString: databaseUrl });
              activeClient.on("error", () => undefined);
              await activeClient.connect();
              await activeClient.query("SELECT 1");

              await cleanupCellDatabase(testDatabaseUrl, databaseName, signal);

              expect(
                await cellDatabaseConnectionAllowed(
                  testDatabaseUrl,
                  databaseName,
                ),
              ).toBeUndefined();
            },
            cleanupTimeoutMs: executionCellCleanupTimeoutMs,
            closeActiveClient: async (): Promise<void> => {
              await closeClient(activeClient);
              activeClient = undefined;
            },
            recover: async (): Promise<void> =>
              await recoverCellDatabase(testDatabaseUrl, databaseName),
          });
        } catch (error) {
          primaryFailure = error;
        }

        let finalizationFailure: unknown;
        try {
          await closeClient(activeClient);
          activeClient = undefined;
          await recoverCellDatabase(testDatabaseUrl, databaseName);
        } catch (error) {
          finalizationFailure = error;
        }
        if (primaryFailure !== undefined && finalizationFailure !== undefined) {
          throw new AggregateError(
            [primaryFailure, finalizationFailure],
            "Cell database cleanup test and final recovery both failed",
          );
        }
        if (primaryFailure !== undefined) throw primaryFailure;
        if (finalizationFailure !== undefined) throw finalizationFailure;
      },
      databaseCleanupIntegrationTestTimeoutMs,
    );
  },
);
