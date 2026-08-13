import { randomUUID } from "node:crypto";

import { agentRun, eq, sql } from "@cat/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createAgentDefinition,
  createAgentRun,
  createAgentSession,
  claimAgentRunOwner,
  createUser,
  executeCommand,
  executeQuery,
  finishAgentRun,
  getAgentSessionByExternalId,
  saveAgentEvent,
  saveAgentRunMetadata,
  saveAgentRunSnapshot,
} from "#/index.ts";
import { setupTestDB, type TestDB } from "#/testing/setup-test-db.ts";

import { createOrClaimAgentRunOwnership } from "./create-or-claim-agent-run-ownership.cmd.ts";

let testDb: TestDB;

const deferred = <Value>() => {
  let resolve: (value: Value | PromiseLike<Value>) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

beforeAll(async () => {
  testDb = await setupTestDB();
});

afterAll(async () => {
  await testDb?.cleanup();
});

const createRun = async (deduplicationKey?: string) => {
  const user = await executeCommand({ db: testDb.client }, createUser, {
    email: `${randomUUID()}@example.com`,
    name: "Agent run owner",
  });
  const definition = await executeCommand(
    { db: testDb.client },
    createAgentDefinition,
    {
      name: `agent-run-owner-${randomUUID()}`,
      description: "",
      scopeType: "GLOBAL",
      scopeId: "",
      definitionId: `agent-run-owner-${randomUUID()}`,
      version: "1.0.0",
      type: "WORKFLOW",
      tools: [],
      content: "",
      isBuiltin: false,
    },
  );
  const session = await executeCommand(
    { db: testDb.client },
    createAgentSession,
    {
      agentDefinitionId: definition.id,
      userId: user.id,
    },
  );
  const sessionRow = await executeQuery(
    { db: testDb.client },
    getAgentSessionByExternalId,
    { externalId: session.sessionId },
  );
  if (!sessionRow) throw new Error("Agent session was not found.");
  const run = await executeCommand({ db: testDb.client }, createAgentRun, {
    sessionId: session.sessionId,
    graphDefinition: {},
    ...(deduplicationKey === undefined ? {} : { deduplicationKey }),
  });
  return { ...run, sessionDbId: sessionRow.id };
};

const ownershipInput = (
  run: { runId: string; sessionDbId: number },
  input?: {
    deduplicationKey?: string | null;
    leaseDurationMs?: number;
    ownerId?: string;
  },
) => ({
  externalId: run.runId,
  sessionId: run.sessionDbId,
  ownerId: input?.ownerId ?? randomUUID(),
  leaseDurationMs: input?.leaseDurationMs ?? 50,
  status: "running" as const,
  graphDefinition: {},
  currentNodeId: null,
  deduplicationKey: input?.deduplicationKey ?? null,
  startedAt: new Date(),
  metadata: null,
});

describe("createOrClaimAgentRunOwnership", () => {
  it("keeps the unowned AgentSession persistence path available", async () => {
    const run = await createRun();
    await executeCommand({ db: testDb.client }, saveAgentRunSnapshot, {
      externalId: run.runId,
      snapshot: { interactive: true },
    });
    await executeCommand({ db: testDb.client }, finishAgentRun, {
      runId: run.runId,
      status: "completed",
    });

    const [persisted] = await testDb.client
      .select({
        blackboardSnapshot: agentRun.blackboardSnapshot,
        ownerId: agentRun.ownerId,
        status: agentRun.status,
      })
      .from(agentRun)
      .where(eq(agentRun.externalId, run.runId));
    expect(persisted).toMatchObject({
      blackboardSnapshot: { interactive: true },
      ownerId: null,
      status: "completed",
    });
  });

  it("uses a post-lock database clock so a waited lease remains renewable", async () => {
    const run = await createRun();
    const holder = await testDb.openConcurrentClient();
    const locked = deferred<void>();
    const release = deferred<void>();
    try {
      const transaction = holder.client.transaction(async (tx) => {
        await tx
          .select({ id: agentRun.id })
          .from(agentRun)
          .where(eq(agentRun.externalId, run.runId))
          .for("update");
        locked.resolve();
        await release.promise;
      });
      await locked.promise;
      const claim = executeCommand(
        { db: testDb.client },
        createOrClaimAgentRunOwnership,
        ownershipInput(run),
      );
      await new Promise((resolve) => setTimeout(resolve, 120));
      release.resolve();
      await transaction;
      const claimed = await claim;
      expect(claimed.kind).toBe("claimed");
      const [persisted] = await testDb.client
        .select({ ownerLeaseExpiresAt: agentRun.ownerLeaseExpiresAt })
        .from(agentRun)
        .where(eq(agentRun.externalId, run.runId));
      expect(persisted?.ownerLeaseExpiresAt?.getTime()).toBeGreaterThan(
        Date.now(),
      );
    } finally {
      release.resolve();
      await holder.cleanup();
    }
  });

  it("returns a typed identity conflict when external and deduplication identities disagree", async () => {
    const externalIdentity = await createRun(`external:${randomUUID()}`);
    const deduplicationKey = `dedupe:${randomUUID()}`;
    const deduplicationIdentity = await createRun(deduplicationKey);

    await expect(
      executeCommand(
        { db: testDb.client },
        createOrClaimAgentRunOwnership,
        ownershipInput(externalIdentity, { deduplicationKey }),
      ),
    ).resolves.toEqual({
      kind: "identity-conflict",
      externalIdRunId: externalIdentity.runId,
      deduplicationKeyRunId: deduplicationIdentity.runId,
    });
  });

  it("rejects unfenced writes to an owned run and accepts its current fence", async () => {
    const run = await createRun();
    const ownerId = randomUUID();
    const claimed = await executeCommand(
      { db: testDb.client },
      createOrClaimAgentRunOwnership,
      ownershipInput(run, { ownerId, leaseDurationMs: 1_000 }),
    );
    if (claimed.kind !== "claimed") throw new Error("Expected owner claim.");

    const metadata = {
      externalId: run.runId,
      sessionId: run.sessionDbId,
      status: "running",
      graphDefinition: {},
      currentNodeId: null,
      deduplicationKey: null,
      startedAt: new Date(),
      completedAt: null,
      metadata: { protected: true },
    };
    const event = {
      runInternalId: run.runDbId,
      eventId: randomUUID(),
      parentEventId: null,
      nodeId: null,
      type: "run:progress",
      payload: { current: 1 },
      timestamp: new Date(),
    };

    await expect(
      executeCommand({ db: testDb.client }, saveAgentRunSnapshot, {
        externalId: run.runId,
        snapshot: { unfenced: true },
      }),
    ).rejects.toThrow("owner lease lost");
    await expect(
      executeCommand({ db: testDb.client }, saveAgentRunMetadata, metadata),
    ).rejects.toThrow("owner lease lost");
    await expect(
      executeCommand({ db: testDb.client }, saveAgentEvent, event),
    ).rejects.toThrow("owner lease lost");
    await expect(
      executeCommand({ db: testDb.client }, finishAgentRun, {
        runId: run.runId,
        status: "completed",
      }),
    ).rejects.toThrow("owner lease lost");

    await executeCommand({ db: testDb.client }, saveAgentRunSnapshot, {
      externalId: run.runId,
      snapshot: { fenced: true },
      ownerId,
      ownerEpoch: claimed.epoch,
    });
    await executeCommand({ db: testDb.client }, saveAgentRunMetadata, {
      ...metadata,
      ownerId,
      ownerEpoch: claimed.epoch,
    });
    await executeCommand({ db: testDb.client }, saveAgentEvent, {
      ...event,
      eventId: randomUUID(),
      ownerId,
      ownerEpoch: claimed.epoch,
    });
    await executeCommand({ db: testDb.client }, finishAgentRun, {
      runId: run.runId,
      status: "completed",
      ownerId,
      ownerEpoch: claimed.epoch,
    });

    const [persisted] = await testDb.client
      .select({
        blackboardSnapshot: agentRun.blackboardSnapshot,
        status: agentRun.status,
      })
      .from(agentRun)
      .where(eq(agentRun.externalId, run.runId));
    expect(persisted).toMatchObject({
      blackboardSnapshot: { fenced: true },
      status: "completed",
    });
  });

  it("rejects a stale owner after takeover from both writes and terminal completion", async () => {
    const run = await createRun();
    const staleOwnerId = randomUUID();
    const initial = await executeCommand(
      { db: testDb.client },
      createOrClaimAgentRunOwnership,
      ownershipInput(run, { ownerId: staleOwnerId, leaseDurationMs: 1_000 }),
    );
    if (initial.kind !== "claimed") throw new Error("Expected owner claim.");
    await testDb.client
      .update(agentRun)
      .set({ ownerLeaseExpiresAt: sql`clock_timestamp() - interval '1 ms'` })
      .where(eq(agentRun.externalId, run.runId));
    const currentOwnerId = randomUUID();
    const takeover = await executeCommand(
      { db: testDb.client },
      claimAgentRunOwner,
      {
        externalId: run.runId,
        ownerId: currentOwnerId,
        leaseDurationMs: 1_000,
      },
    );
    if (!takeover) throw new Error("Expected owner takeover.");

    await expect(
      executeCommand({ db: testDb.client }, saveAgentRunSnapshot, {
        externalId: run.runId,
        snapshot: { stale: true },
        ownerId: staleOwnerId,
        ownerEpoch: initial.epoch,
      }),
    ).rejects.toThrow("owner lease lost");
    await expect(
      executeCommand({ db: testDb.client }, finishAgentRun, {
        runId: run.runId,
        status: "completed",
        ownerId: staleOwnerId,
        ownerEpoch: initial.epoch,
      }),
    ).rejects.toThrow("owner lease lost");
    await executeCommand({ db: testDb.client }, saveAgentRunSnapshot, {
      externalId: run.runId,
      snapshot: { current: true },
      ownerId: currentOwnerId,
      ownerEpoch: takeover.epoch,
    });
    await executeCommand({ db: testDb.client }, finishAgentRun, {
      runId: run.runId,
      status: "completed",
      ownerId: currentOwnerId,
      ownerEpoch: takeover.epoch,
    });
  });
});
