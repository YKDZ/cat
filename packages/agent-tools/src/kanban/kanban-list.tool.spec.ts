import type { ToolExecutionContext } from "@cat/agent";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  claimCard: Symbol("claimCard"),
  listCards: Symbol("listCards"),
  updateCardStatus: Symbol("updateCardStatus"),
  executeQuery: vi.fn(),
  executeCommand: vi.fn(),
  getDbHandle: vi.fn().mockResolvedValue({ client: { tag: "db" } }),
}));

vi.mock("@cat/domain", () => ({
  claimCard: mocked.claimCard,
  executeCommand: mocked.executeCommand,
  executeQuery: mocked.executeQuery,
  getDbHandle: mocked.getDbHandle,
  listCards: mocked.listCards,
  updateCardStatus: mocked.updateCardStatus,
}));

import { kanbanClaimTool } from "./kanban-claim.tool.ts";
import { kanbanListTool } from "./kanban-list.tool.ts";
import { kanbanUpdateTool } from "./kanban-update.tool.ts";

const createCtx = (
  overrides?: Partial<ToolExecutionContext["session"]>,
): ToolExecutionContext => ({
  session: {
    sessionId: "11111111-1111-4111-8111-111111111111",
    agentId: "agent-1",
    projectId: "project-1",
    runId: "22222222-2222-4222-8222-222222222222",
    kanbanBoardId: 9,
    kanbanCardId: 77,
    ...overrides,
  },
  permissions: {
    checkPermission: vi.fn().mockResolvedValue(true),
  },
  cost: { budgetId: "budget-1", remainingTokens: 10_000 },
  vcsMode: "trust",
});

describe("kanban tools", () => {
  beforeEach(() => {
    mocked.executeQuery.mockReset();
    mocked.executeCommand.mockReset();
    mocked.getDbHandle.mockClear();
  });

  it("uses session kanbanBoardId fallback when listing cards", async () => {
    mocked.executeQuery.mockResolvedValue([
      {
        id: 1,
        externalId: "card-ext-1",
        title: "Claim me",
        status: "OPEN",
        columnId: "todo",
        linkedResourceType: null,
        linkedResourceId: null,
      },
    ]);

    const result = await kanbanListTool.execute(
      { status: "OPEN" },
      createCtx(),
    );

    expect(mocked.executeQuery).toHaveBeenCalledWith(
      { db: { tag: "db" } },
      mocked.listCards,
      { boardId: 9, status: "OPEN", columnId: undefined },
    );
    expect(result).toEqual([
      {
        id: 1,
        externalId: "card-ext-1",
        title: "Claim me",
        status: "OPEN",
        columnId: "todo",
        linkedResourceType: null,
        linkedResourceId: null,
      },
    ]);
  });

  it("uses session kanbanBoardId fallback when claiming a card", async () => {
    mocked.executeCommand.mockResolvedValue({
      id: 3,
      externalId: "card-ext-3",
    });

    await kanbanClaimTool.execute({}, createCtx());

    expect(mocked.executeCommand).toHaveBeenCalledWith(
      { db: { tag: "db" } },
      mocked.claimCard,
      {
        boardId: 9,
        claimableStatuses: ["OPEN", "NEEDS_REWORK"],
      },
    );
  });

  it("uses session kanbanCardId fallback when updating a card", async () => {
    mocked.executeCommand.mockResolvedValue({ success: true });

    await kanbanUpdateTool.execute({ status: "DONE" }, createCtx());

    expect(mocked.executeCommand).toHaveBeenCalledWith(
      { db: { tag: "db" } },
      mocked.updateCardStatus,
      {
        cardId: 77,
        status: "DONE",
      },
    );
  });
});
