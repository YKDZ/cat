import { randomUUID } from "node:crypto";

import {
  claimAgentRunOwner,
  createAgentDefinition,
  createUser,
  executeCommand,
  executeQuery,
  getAgentSessionByExternalId,
  loadAgentRunMetadata,
} from "@cat/domain";
import { setupTestDB, type TestDB } from "@cat/test-utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SessionManager } from "./session-manager.ts";

describe("SessionManager cancellation terminalization", () => {
  let database: TestDB;

  beforeAll(async () => {
    database = await setupTestDB();
  });

  afterAll(async () => {
    await database.cleanup();
  });

  const createSession = async () => {
    const user = await executeCommand({ db: database.client }, createUser, {
      email: `${randomUUID()}@agent.test`,
      name: "Agent cancellation test",
    });
    const definition = await executeCommand(
      { db: database.client },
      createAgentDefinition,
      {
        name: `cancel-${randomUUID()}`,
        description: "",
        scopeType: "GLOBAL",
        scopeId: "",
        definitionId: `cancel-${randomUUID()}`,
        version: "1.0.0",
        type: "GENERAL",
        tools: [],
        content: "",
        isBuiltin: false,
      },
    );
    const manager = new SessionManager();
    const identifiers = await manager.createSession({
      agentDefinitionId: definition.id,
      userId: user.id,
    });
    return { manager, ...identifiers };
  };

  it("persists matching cancelled session and run terminal states", async () => {
    const { manager, runId, sessionId } = await createSession();

    await manager.completeSession(sessionId, runId, "CANCELLED");

    const [session, run] = await Promise.all([
      executeQuery({ db: database.client }, getAgentSessionByExternalId, {
        externalId: sessionId,
      }),
      executeQuery({ db: database.client }, loadAgentRunMetadata, {
        externalId: runId,
      }),
    ]);
    expect(session).toMatchObject({ status: "CANCELLED", currentRunId: null });
    expect(run).toMatchObject({ status: "cancelled" });
    expect(run?.completedAt).toBeInstanceOf(Date);
  });

  it("rolls back the session terminal state when run terminalization fails", async () => {
    const { manager, runId, sessionId } = await createSession();
    await executeCommand({ db: database.client }, claimAgentRunOwner, {
      externalId: runId,
      ownerId: randomUUID(),
      leaseDurationMs: 60_000,
    });

    await expect(
      manager.completeSession(sessionId, runId, "CANCELLED"),
    ).rejects.toThrow("Workflow owner lease lost");

    const [session, run] = await Promise.all([
      executeQuery({ db: database.client }, getAgentSessionByExternalId, {
        externalId: sessionId,
      }),
      executeQuery({ db: database.client }, loadAgentRunMetadata, {
        externalId: runId,
      }),
    ]);
    expect(session).toMatchObject({ status: "ACTIVE" });
    expect(session?.currentRunId).not.toBeNull();
    expect(run).toMatchObject({ status: "running", completedAt: null });
  });
});
