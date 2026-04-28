import type { AgentInvoker, AgentContext, AgentEvent } from "./protocol.js";

import { ClaudeCodeAdapter } from "./adapters/claude-code.js";

export class AgentDispatcher {
  private readonly adapters: Map<string, AgentInvoker>;

  constructor() {
    this.adapters = new Map();
    this.adapters.set("claude-code", new ClaudeCodeAdapter());
  }

  async *dispatch(
    provider: string,
    context: AgentContext,
  ): AsyncIterable<AgentEvent> {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      yield {
        type: "error",
        data: `Unknown agent provider: ${provider}`,
      };
      yield { type: "exit", exitCode: 1 };
      return;
    }

    yield* adapter.invoke(context);
  }
}
