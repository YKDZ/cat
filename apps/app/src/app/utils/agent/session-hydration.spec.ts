import { describe, expect, it } from "vitest";

import {
  hydrateMessagesFromBlackboard,
  hydrateSessionState,
} from "@/app/utils/agent/session-hydration";

describe("session-hydration", () => {
  it("hydrates user and assistant messages", () => {
    const messages = hydrateMessagesFromBlackboard({
      messages: [
        {
          role: "user",
          content: "hello",
          createdAt: "2026-04-11T00:00:00.000Z",
        },
        { role: "assistant", content: "world" },
      ],
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "USER", content: "hello" });
    expect(messages[1]).toMatchObject({ role: "ASSISTANT", content: "world" });
    expect(messages[0]?.createdAt).toBeInstanceOf(Date);
  });

  it("filters tool and system messages", () => {
    const messages = hydrateMessagesFromBlackboard({
      messages: [
        { role: "tool", content: "hidden" },
        { role: "system", content: "also hidden" },
        { role: "assistant", content: "visible" },
      ],
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: "ASSISTANT",
      content: "visible",
    });
  });

  it("returns an empty array when the snapshot has no messages", () => {
    expect(hydrateMessagesFromBlackboard(null)).toEqual([]);
    expect(hydrateMessagesFromBlackboard({})).toEqual([]);
  });

  it("preserves run, metadata, and current card context", () => {
    const state = hydrateSessionState({
      sessionId: "session-1",
      agentDefinitionId: "agent-1",
      status: "ACTIVE",
      metadata: {
        providerId: 42,
        projectId: "11111111-1111-4111-8111-111111111111",
      },
      runId: "run-1",
      runStatus: "running",
      blackboardSnapshot: {
        current_card_id: "card-1",
        messages: [{ role: "assistant", content: "ready" }],
      },
    });

    expect(state.runId).toBe("run-1");
    expect(state.metadata?.providerId).toBe(42);
    expect(state.currentKanbanCardId).toBe("card-1");
    expect(state.messages[0]).toMatchObject({
      role: "ASSISTANT",
      content: "ready",
    });
  });
});
