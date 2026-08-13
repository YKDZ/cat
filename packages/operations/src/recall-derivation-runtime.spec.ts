import { RecallDerivationReferenceSchema } from "@cat/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const reconcile = Symbol("reconcile");
  const claim = Symbol("claim");
  const renew = Symbol("renew");
  const recordFailure = Symbol("recordFailure");
  const release = Symbol("release");
  const calls: symbol[] = [];
  const trace: string[] = [];
  const claims: Array<Record<string, unknown>> = [];
  const memoryAdapter = {
    targetKind: "MEMORY_ITEM" as const,
    deriveAndPublish: vi.fn(),
    probeCurrentDependencies: vi.fn(),
  };
  const glossaryAdapter = {
    targetKind: "TERM_CONCEPT" as const,
    deriveAndPublish: vi.fn(),
    probeCurrentDependencies: vi.fn(),
  };
  const executeQuery = vi.fn();
  const executeCommand = vi.fn(
    async (
      _context: unknown,
      command: symbol,
      input: Record<string, unknown>,
    ) => {
      calls.push(command);
      const deferred = deferredCommands.get(command);
      if (deferred) await deferred;
      const result =
        command === claim
          ? claims.length === 0
            ? []
            : [claims.shift()]
          : command === recordFailure
            ? { status: "FAILED" }
            : input;
      trace.push(`command:${command.description}`);
      return result;
    },
  );
  const deferredCommands = new Map<symbol, Promise<void>>();
  return {
    calls,
    claim,
    claims,
    deferredCommands,
    executeCommand,
    executeQuery,
    glossaryAdapter,
    loggerWarn: vi.fn(),
    memoryAdapter,
    reconcile,
    recordFailure,
    release,
    trace,
    renew,
  };
});

vi.mock("@cat/domain", () => ({
  claimRecallDerivationDemands: mocks.claim,
  executeCommand: mocks.executeCommand,
  executeQuery: mocks.executeQuery,
  getRecallDerivationStates: Symbol("getStates"),
  reconcileRecallDerivationDemands: mocks.reconcile,
  recordRecallDerivationFailure: mocks.recordFailure,
  releaseRecallDerivationWorkerLeases: mocks.release,
  renewRecallDerivationLease: mocks.renew,
}));

vi.mock("@cat/server-shared", () => ({
  serverLogger: {
    child: () => ({ error: vi.fn(), warn: vi.fn() }),
    warn: mocks.loggerWarn,
  },
}));

vi.mock("./memory-recall-derivation.ts", () => ({
  memoryRecallDerivationAdapter: mocks.memoryAdapter,
}));

vi.mock("./glossary-recall-derivation.ts", () => ({
  glossaryRecallDerivationAdapter: mocks.glossaryAdapter,
}));

vi.mock("./language-analysis-requirement.ts", () => ({
  LanguageAnalysisRequirementError: class LanguageAnalysisRequirementError extends Error {},
}));

import { RecallDerivationAdapterError } from "./recall-derivation-adapter.ts";
import {
  assessRecallDerivationFreshness,
  processRecallDerivationBatch,
  recallDerivationAdapters,
  startRecallDerivationWorker,
  waitForRecallDerivationFresh,
} from "./recall-derivation-runtime.ts";

const claim = (targetKind: "MEMORY_ITEM" | "TERM_CONCEPT") => ({
  canonicalInputVersion: "sha256:canonical",
  demandRevision: 1,
  executionEpoch: 1,
  id: 1,
  languageId: "en",
  leaseToken: "lease-token",
  requiredDerivationVersion: "sha256:derivation",
  targetId: "1",
  targetKind,
});

const options = () => ({
  db: {} as never,
  pluginManager: {} as never,
  limit: 1,
  workerId: "runtime-spec-worker",
});

describe("Recall Derivation runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.claims.length = 0;
    mocks.deferredCommands.clear();
    mocks.trace.length = 0;
    mocks.memoryAdapter.deriveAndPublish.mockResolvedValue({
      status: "PUBLISHED",
    });
    mocks.glossaryAdapter.deriveAndPublish.mockResolvedValue({
      status: "PUBLISHED",
    });
    mocks.memoryAdapter.probeCurrentDependencies.mockResolvedValue({
      committed: false,
    });
    mocks.glossaryAdapter.probeCurrentDependencies.mockResolvedValue({
      committed: false,
    });
  });

  it("closes dispatch to the Memory and Glossary adapters", async () => {
    expect(Object.keys(recallDerivationAdapters).sort()).toEqual([
      "MEMORY_ITEM",
      "TERM_CONCEPT",
    ]);
    mocks.claims.push(claim("TERM_CONCEPT"));

    await processRecallDerivationBatch(options());

    expect(mocks.glossaryAdapter.deriveAndPublish).toHaveBeenCalledOnce();
    expect(mocks.memoryAdapter.deriveAndPublish).not.toHaveBeenCalled();
  });

  it("observes reconcile, claim, and publication after their commits", async () => {
    mocks.claims.push(claim("MEMORY_ITEM"));
    const commits: string[] = [];

    const result = await processRecallDerivationBatch({
      ...options(),
      onStateCommitted: async (commit) => {
        commits.push(commit);
        mocks.trace.push(`observer:${commit}`);
      },
    });

    expect(result).toEqual({ claimed: 1, published: 1, stale: 0, failed: 0 });
    expect(commits).toEqual(["RECONCILED", "CLAIMED", "PUBLISHED"]);
    expect(mocks.trace.slice(0, 4)).toEqual([
      "command:reconcile",
      "observer:RECONCILED",
      "command:claim",
      "observer:CLAIMED",
    ]);
  });

  it("waits for claim command completion before notifying its observer", async () => {
    mocks.claims.push(claim("MEMORY_ITEM"));
    let resolveClaim: (() => void) | undefined;
    mocks.deferredCommands.set(
      mocks.claim,
      new Promise<void>((resolve) => {
        resolveClaim = resolve;
      }),
    );
    const commits: string[] = [];
    const pending = processRecallDerivationBatch({
      ...options(),
      onStateCommitted: async (commit) => {
        commits.push(commit);
        mocks.trace.push(`observer:${commit}`);
      },
    });

    await vi.waitFor(() => expect(commits).toEqual(["RECONCILED"]));
    expect(mocks.trace).not.toContain("command:claim");
    expect(commits).not.toContain("CLAIMED");

    resolveClaim?.();
    await pending;

    expect(mocks.trace.indexOf("command:claim")).toBeLessThan(
      mocks.trace.indexOf("observer:CLAIMED"),
    );
  });

  it("counts and observes a fenced stale publication", async () => {
    mocks.claims.push(claim("MEMORY_ITEM"));
    mocks.memoryAdapter.deriveAndPublish.mockResolvedValue({
      status: "STALE",
      reconciled: true,
    });
    const commits: string[] = [];

    const result = await processRecallDerivationBatch({
      ...options(),
      onStateCommitted: async (commit) => {
        commits.push(commit);
        mocks.trace.push(`observer:${commit}`);
      },
    });

    expect(result).toEqual({ claimed: 1, published: 0, stale: 1, failed: 0 });
    expect(commits).toEqual(["RECONCILED", "CLAIMED", "RECONCILED", "STALE"]);
  });

  it("observes failure after a typed adapter blocker is recorded", async () => {
    mocks.claims.push(claim("MEMORY_ITEM"));
    mocks.memoryAdapter.deriveAndPublish.mockRejectedValue(
      new RecallDerivationAdapterError({
        reason: "DERIVATION_EXECUTION",
        retryable: false,
        message: "derive failed",
      }),
    );
    const commits: string[] = [];

    const result = await processRecallDerivationBatch({
      ...options(),
      onStateCommitted: async (commit) => {
        commits.push(commit);
        mocks.trace.push(`observer:${commit}`);
      },
    });

    expect(result).toEqual({ claimed: 1, published: 0, stale: 0, failed: 1 });
    expect(commits).toEqual(["RECONCILED", "CLAIMED", "FAILED"]);
    expect(mocks.executeCommand).toHaveBeenCalledWith(
      expect.anything(),
      mocks.recordFailure,
      expect.objectContaining({
        blocker: expect.objectContaining({ reason: "DERIVATION_EXECUTION" }),
      }),
    );
    expect(mocks.trace.indexOf("command:recordFailure")).toBeLessThan(
      mocks.trace.indexOf("observer:FAILED"),
    );
  });

  it("isolates presentation observer failures from committed runtime work", async () => {
    mocks.claims.push(claim("MEMORY_ITEM"));
    const observer = async () => {
      throw new Error("projection unavailable");
    };

    const result = await processRecallDerivationBatch({
      ...options(),
      onStateCommitted: observer,
    });

    expect(result).toEqual({ claimed: 1, published: 1, stale: 0, failed: 0 });
    const worker = await startRecallDerivationWorker({
      ...options(),
      onStateCommitted: observer,
      pollIntervalMs: 1,
    });
    await worker.stop();
    expect(mocks.loggerWarn).toHaveBeenCalled();
  });

  it("observes recovery after an unusable claim and worker lease release", async () => {
    mocks.claims.push({ ...claim("MEMORY_ITEM"), leaseToken: null });
    const commits: string[] = [];
    const batch = await processRecallDerivationBatch({
      ...options(),
      onStateCommitted: async (commit) => {
        commits.push(commit);
        mocks.trace.push(`observer:${commit}`);
      },
    });
    expect(batch).toEqual({ claimed: 1, published: 0, stale: 0, failed: 1 });
    expect(commits).toEqual(["RECONCILED", "CLAIMED", "RECONCILED"]);

    const worker = await startRecallDerivationWorker({
      ...options(),
      onStateCommitted: async (commit) => {
        commits.push(commit);
        mocks.trace.push(`observer:${commit}`);
      },
      pollIntervalMs: 1,
    });
    await worker.stop();

    expect(mocks.calls).toContain(mocks.release);
    expect(commits).toContain("RELEASED");
    expect(mocks.trace.indexOf("command:release")).toBeLessThan(
      mocks.trace.lastIndexOf("observer:RELEASED"),
    );
  });

  it("only observes persisted pending work while waiting", async () => {
    const reference = RecallDerivationReferenceSchema.parse({
      demandRevision: 1,
      languageId: "en",
      targetId: "100",
      targetKind: "MEMORY_ITEM",
    });
    mocks.executeQuery.mockResolvedValue([
      {
        blocker: null,
        demandRevision: 1,
        languageId: "en",
        status: "PENDING",
        targetId: "100",
        targetKind: "MEMORY_ITEM",
      },
    ]);

    await expect(
      waitForRecallDerivationFresh([reference], {
        db: {} as never,
        pollIntervalMs: 1,
        timeoutMs: 10,
      }),
    ).rejects.toMatchObject({ status: "TIMEOUT" });

    expect(mocks.calls).toEqual([]);
    expect(mocks.memoryAdapter.deriveAndPublish).not.toHaveBeenCalled();
    expect(mocks.memoryAdapter.probeCurrentDependencies).not.toHaveBeenCalled();
  });

  it("returns complete evidence for persisted pending work", async () => {
    const reference = RecallDerivationReferenceSchema.parse({
      demandRevision: 1,
      languageId: "en",
      targetId: "100",
      targetKind: "MEMORY_ITEM",
    });
    mocks.memoryAdapter.probeCurrentDependencies.mockResolvedValueOnce({
      references: [reference],
    });
    mocks.executeQuery.mockResolvedValueOnce([
      {
        blocker: null,
        demandRevision: 1,
        languageId: "en",
        status: "PENDING",
        targetId: "100",
        targetKind: "MEMORY_ITEM",
      },
    ]);

    await expect(
      assessRecallDerivationFreshness([reference], {
        db: {} as never,
        pluginManager: {} as never,
      }),
    ).resolves.toEqual({
      status: "PENDING",
      references: [reference],
      blockers: [],
    });
  });

  it("returns only non-fresh persisted references with retryable blockers", async () => {
    const freshReference = RecallDerivationReferenceSchema.parse({
      demandRevision: 1,
      languageId: "en",
      targetId: "100",
      targetKind: "MEMORY_ITEM",
    });
    const pendingReference = RecallDerivationReferenceSchema.parse({
      demandRevision: 2,
      languageId: "fr",
      targetId: "100",
      targetKind: "MEMORY_ITEM",
    });
    mocks.executeQuery.mockResolvedValueOnce([
      {
        canonicalInputVersion: "sha256:canonical",
        currentCanonicalInputVersion: "sha256:canonical",
        currentDerivationVersion: "sha256:derivation",
        demandRevision: 1,
        languageId: "en",
        requiredDerivationVersion: "sha256:derivation",
        status: "FRESH",
        targetId: "100",
        targetKind: "MEMORY_ITEM",
      },
      {
        blocker: {
          message: "analyzer is restarting",
          reason: "LANGUAGE_ANALYSIS",
          retryable: true,
        },
        demandRevision: 2,
        languageId: "fr",
        status: "BLOCKED",
        targetId: "100",
        targetKind: "MEMORY_ITEM",
      },
    ]);

    await expect(
      assessRecallDerivationFreshness([freshReference, pendingReference], {
        db: {} as never,
        pluginManager: {} as never,
      }),
    ).resolves.toEqual({
      status: "PENDING",
      references: [pendingReference],
      blockers: [
        {
          message: "analyzer is restarting",
          reason: "LANGUAGE_ANALYSIS",
          retryable: true,
        },
      ],
    });
  });

  it("keeps observing a retryable persisted block until a worker makes it fresh", async () => {
    const reference = RecallDerivationReferenceSchema.parse({
      demandRevision: 1,
      languageId: "en",
      targetId: "101",
      targetKind: "MEMORY_ITEM",
    });
    mocks.executeQuery
      .mockResolvedValueOnce([
        {
          blocker: {
            message: "analyzer is restarting",
            reason: "LANGUAGE_ANALYSIS",
            retryable: true,
          },
          demandRevision: 1,
          languageId: "en",
          status: "BLOCKED",
          targetId: "101",
          targetKind: "MEMORY_ITEM",
        },
      ])
      .mockResolvedValueOnce([
        {
          blocker: null,
          canonicalInputVersion: "sha256:canonical",
          currentCanonicalInputVersion: "sha256:canonical",
          currentDerivationVersion: "sha256:derivation",
          demandRevision: 1,
          languageId: "en",
          requiredDerivationVersion: "sha256:derivation",
          status: "FRESH",
          targetId: "101",
          targetKind: "MEMORY_ITEM",
        },
      ]);

    await expect(
      waitForRecallDerivationFresh([reference], {
        db: {} as never,
        pollIntervalMs: 1,
        timeoutMs: 100,
      }),
    ).resolves.toBeUndefined();

    expect(mocks.calls).toEqual([]);
    expect(mocks.memoryAdapter.deriveAndPublish).not.toHaveBeenCalled();
    expect(mocks.memoryAdapter.probeCurrentDependencies).not.toHaveBeenCalled();
  });

  it("keeps retryable probe blockers pollable until a later probe is fresh", async () => {
    const reference = RecallDerivationReferenceSchema.parse({
      demandRevision: 1,
      languageId: "en",
      targetId: "1",
      targetKind: "MEMORY_ITEM",
    });
    mocks.memoryAdapter.probeCurrentDependencies.mockRejectedValueOnce(
      new RecallDerivationAdapterError({
        reason: "TOKENIZER",
        retryable: true,
        message: "temporary tokenizer outage",
      }),
    );

    await expect(
      assessRecallDerivationFreshness([reference], {
        db: {} as never,
        pluginManager: {} as never,
      }),
    ).resolves.toEqual({
      status: "PENDING",
      references: [reference],
      blockers: [
        {
          reason: "TOKENIZER",
          retryable: true,
          message: "temporary tokenizer outage",
        },
      ],
    });

    mocks.executeQuery.mockResolvedValueOnce([
      {
        canonicalInputVersion: "sha256:canonical",
        currentCanonicalInputVersion: "sha256:canonical",
        currentDerivationVersion: "sha256:derivation",
        demandRevision: 1,
        languageId: "en",
        requiredDerivationVersion: "sha256:derivation",
        status: "FRESH",
        targetId: "1",
        targetKind: "MEMORY_ITEM",
      },
    ]);
    await expect(
      assessRecallDerivationFreshness([reference], {
        db: {} as never,
        pluginManager: {} as never,
      }),
    ).resolves.toEqual({ status: "FRESH" });
  });

  it("classifies a nonretryable tokenizer probe failure as blocked", async () => {
    const reference = RecallDerivationReferenceSchema.parse({
      demandRevision: 1,
      languageId: "en",
      targetId: "1",
      targetKind: "MEMORY_ITEM",
    });
    mocks.memoryAdapter.probeCurrentDependencies.mockRejectedValueOnce(
      new RecallDerivationAdapterError({
        reason: "TOKENIZER",
        retryable: false,
        message: "Tokenizer configuration is invalid.",
      }),
    );

    await expect(
      assessRecallDerivationFreshness([reference], {
        db: {} as never,
        pluginManager: {} as never,
      }),
    ).resolves.toMatchObject({
      status: "BLOCKED",
      blockers: [{ reason: "TOKENIZER", retryable: false }],
    });
  });

  it("prioritizes a deterministic dependency block over a retryable probe failure", async () => {
    const reference = RecallDerivationReferenceSchema.parse({
      demandRevision: 1,
      languageId: "en",
      targetId: "1",
      targetKind: "MEMORY_ITEM",
    });
    mocks.memoryAdapter.probeCurrentDependencies.mockRejectedValueOnce(
      new RecallDerivationAdapterError([
        {
          reason: "DERIVATION_EXECUTION",
          retryable: true,
          message: "Transient execution failure.",
        },
        {
          reason: "TOKENIZER",
          retryable: false,
          message: "Tokenizer configuration is invalid.",
        },
      ]),
    );

    await expect(
      assessRecallDerivationFreshness([reference], {
        db: {} as never,
        pluginManager: {} as never,
      }),
    ).resolves.toMatchObject({
      status: "BLOCKED",
      references: [reference],
      blockers: [
        { reason: "DERIVATION_EXECUTION", retryable: true },
        { reason: "TOKENIZER", retryable: false },
      ],
    });
  });

  it("prioritizes a failed execution over blocked and retryable probe failures", async () => {
    const reference = RecallDerivationReferenceSchema.parse({
      demandRevision: 1,
      languageId: "en",
      targetId: "1",
      targetKind: "MEMORY_ITEM",
    });
    mocks.memoryAdapter.probeCurrentDependencies.mockRejectedValueOnce(
      new RecallDerivationAdapterError([
        {
          reason: "DERIVATION_EXECUTION",
          retryable: true,
          message: "Transient execution failure.",
        },
        {
          reason: "TOKENIZER",
          retryable: false,
          message: "Tokenizer configuration is invalid.",
        },
        {
          reason: "DERIVATION_EXECUTION",
          retryable: false,
          message: "Canonical derivation input is invalid.",
        },
      ]),
    );

    await expect(
      assessRecallDerivationFreshness([reference], {
        db: {} as never,
        pluginManager: {} as never,
      }),
    ).resolves.toMatchObject({
      status: "FAILED",
      references: [reference],
      blockers: [
        { reason: "DERIVATION_EXECUTION", retryable: true },
        { reason: "TOKENIZER", retryable: false },
        { reason: "DERIVATION_EXECUTION", retryable: false },
      ],
    });
  });

  it("classifies a persisted nonretryable execution blocker as failed", async () => {
    const reference = RecallDerivationReferenceSchema.parse({
      demandRevision: 1,
      languageId: "en",
      targetId: "1",
      targetKind: "MEMORY_ITEM",
    });
    mocks.executeQuery.mockResolvedValueOnce([
      {
        blocker: {
          reason: "DERIVATION_EXECUTION",
          retryable: false,
          message: "Canonical derivation input is invalid.",
        },
        demandRevision: 1,
        languageId: "en",
        status: "BLOCKED",
        targetId: "1",
        targetKind: "MEMORY_ITEM",
      },
    ]);

    await expect(
      assessRecallDerivationFreshness([reference], {
        db: {} as never,
        pluginManager: {} as never,
      }),
    ).resolves.toMatchObject({
      status: "FAILED",
      blockers: [{ reason: "DERIVATION_EXECUTION", retryable: false }],
    });
  });
});
