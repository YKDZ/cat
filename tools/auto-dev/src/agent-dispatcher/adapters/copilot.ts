import type { AgentInvoker, AgentContext, AgentEvent } from "../protocol.js";

export class CopilotAdapter implements AgentInvoker {
  async *invoke(context: AgentContext): AsyncIterable<AgentEvent> {
    yield { type: "error", data: "Copilot adapter not yet implemented" };
    yield { type: "exit", exitCode: 1 };
  }
}
