import { describe, it, expect } from "vitest";

import type { AgentContext } from "./protocol.js";

import { AgentDispatcher } from "./dispatcher.js";

const dummyContext: AgentContext = {
  systemPrompt: "",
  issueContext: "",
  agentDefinition: "",
  model: null,
  effort: null,
  workspaceRoot: "",
};

describe("AgentDispatcher", () => {
  it("unknown provider yields error event then exit", async () => {
    const dispatcher = new AgentDispatcher();
    const events: unknown[] = [];
    for await (const event of dispatcher.dispatch("unknown", dummyContext)) {
      events.push(event);
    }
    const first = events[0] as Record<string, unknown>;
    expect(first.type).toBe("error");
    expect(first.data).toContain("Unknown");
    const second = events[1] as Record<string, unknown>;
    expect(second.type).toBe("exit");
    expect(second.exitCode).toBe(1);
  });
});
