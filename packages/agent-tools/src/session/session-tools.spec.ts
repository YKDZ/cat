import type { ToolExecutionContext } from "@cat/agent";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  completeAgentSession: Symbol("completeAgentSession"),
  loadAgentRunSnapshot: Symbol("loadAgentRunSnapshot"),
  saveAgentRunSnapshot: Symbol("saveAgentRunSnapshot"),
  updateCardStatus: Symbol("updateCardStatus"),
  executeQuery: vi.fn(),
  executeCommand: vi.fn(),
  getDbHandle: vi.fn().mockResolvedValue({ client: { tag: "db" } }),
}));

vi.mock("@cat/domain", () => ({
  completeAgentSession: mocked.completeAgentSession,
  executeCommand: mocked.executeCommand,
  executeQuery: mocked.executeQuery,
  getDbHandle: mocked.getDbHandle,
  loadAgentRunSnapshot: mocked.loadAgentRunSnapshot,
  saveAgentRunSnapshot: mocked.saveAgentRunSnapshot,
  updateCardStatus: mocked.updateCardStatus,
}));

import { finishTool } from "./finish.tool.ts";
import { readPrecheckTool } from "./read-precheck.tool.ts";
import { updateScratchpadTool } from "./update-scratchpad.tool.ts";

const sessionId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";

const createCtx = (
  overrides?: Partial<ToolExecutionContext["session"]>,
): ToolExecutionContext => ({
  session: {
    sessionId,
    agentId: "agent-1",
    projectId: "project-1",
    runId,
    kanbanCardId: 42,
    ...overrides,
  },
  permissions: {
    checkPermission: vi.fn().mockResolvedValue(true),
  },
  cost: { budgetId: "budget-1", remainingTokens: 10_000 },
  vcsMode: "trust",
});

describe("session tools", () => {
  beforeEach(() => {
    mocked.executeQuery.mockReset();
    mocked.executeCommand.mockReset();
    mocked.getDbHandle.mockClear();
  });

  it("reads precheck notes from top-level blackboard snapshot using session runId fallback", async () => {
    mocked.executeQuery.mockResolvedValue({
      precheck_notes: "deps blocked",
      scratchpad: "remember to retry",
    });

    const result = await readPrecheckTool.execute({}, createCtx());

    expect(mocked.executeQuery).toHaveBeenCalledWith(
      { db: { tag: "db" } },
      mocked.loadAgentRunSnapshot,
      { externalId: runId },
    );
    expect(result).toEqual({
      precheckNotes: "deps blocked",
      scratchpad: "remember to retry",
    });
  });

  it("updates scratchpad at the top level of the persisted snapshot", async () => {
    mocked.executeQuery.mockResolvedValue({
      precheck_notes: "deps blocked",
      scratchpad: "old value",
      current_card_id: "card-1",
    });

    await updateScratchpadTool.execute(
      { scratchpad: "new notes" },
      createCtx(),
    );

    expect(mocked.executeCommand).toHaveBeenCalledWith(
      { db: { tag: "db" } },
      mocked.saveAgentRunSnapshot,
      {
        externalId: runId,
        snapshot: {
          precheck_notes: "deps blocked",
          scratchpad: "new notes",
          current_card_id: "card-1",
        },
      },
    );
  });

  it("falls back to session context when finish omits sessionId and kanbanCardId", async () => {
    const result = await finishTool.execute(
      { reason: "all done" },
      createCtx(),
    );

    expect(mocked.executeCommand).toHaveBeenNthCalledWith(
      1,
      { db: { tag: "db" } },
      mocked.completeAgentSession,
      {
        sessionId,
        finalStatus: "COMPLETED",
      },
    );
    expect(mocked.executeCommand).toHaveBeenNthCalledWith(
      2,
      { db: { tag: "db" } },
      mocked.updateCardStatus,
      {
        cardId: 42,
        status: "DONE",
      },
    );
    expect(result).toEqual({ finished: true, reason: "all done" });
  });
});
