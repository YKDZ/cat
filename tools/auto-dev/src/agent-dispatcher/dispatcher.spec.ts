import { describe, it, expect } from "vitest";
import { AgentDispatcher } from "./dispatcher.js";

describe("AgentDispatcher", () => {
  it("unknown provider yields error event then exit", async () => {
    const dispatcher = new AgentDispatcher();
    const events: any[] = [];
    for await (const event of dispatcher.dispatch("unknown", null as any)) {
      events.push(event);
    }
    expect(events[0].type).toBe("error");
    expect(events[0].data).toContain("Unknown");
    expect(events[1].type).toBe("exit");
    expect(events[1].exitCode).toBe(1);
  });
});
