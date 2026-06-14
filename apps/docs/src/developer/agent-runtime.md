# Agent Runtime

CAT's agent runtime is a DAG-based ReAct loop. The loop shares state through a graph blackboard and emits runtime events so callers can stream progress to the UI or another integration.

## Loop Structure

Each turn flows through PreCheck, Reasoning, Tool, and Decision nodes.

PreCheck enforces step and timeout limits before expensive work begins. It increments the turn counter and writes the current state summary to the blackboard.

Reasoning reads message history, builds the prompt, calls the LLM gateway, consumes the streamed response, and writes assistant text, thinking text, tool calls, and token usage back to the blackboard. If the context grows too large, the compression pipeline condenses history before the next model call.

The Tool node executes requested tools concurrently and appends tool-role messages to history. Tool execution runs through the declared tool interface, where permissions, side-effect type, cost status, and VCS context can be enforced.

Decision decides whether the loop should continue based on finish state, tool calls, step limits, and timeout state.

## Runtime State

The blackboard owns the active session state: messages, tool calls, tool results, current turn, finish status, token usage, and scratchpad notes. Keeping this state in one shared graph object lets each node remain focused while preserving a coherent session snapshot.

The session manager owns durable sessions and runs. It creates sessions, saves snapshots, and marks sessions complete. The runtime emits events such as started, LLM completion, tool call, tool result, finished, and failed so the caller does not need to inspect internal node state.

## Prompt And Model Boundaries

The prompt engine parses agent definitions from Markdown and frontmatter, then applies slot policies. Static slots are always injected, on-demand slots are available when requested, and disabled slots stay out of the prompt. This allows a single agent definition to adapt to different runtime costs and context windows.

The LLM gateway centralizes model concurrency, rate limiting, and request priority. That boundary keeps node code from managing provider-specific throttling and gives critical requests priority over lower-value background work.

## Approval And Tool Safety

Tools declare their side effects and security level. The runtime context carries permission checks and approval state so the agent can reason through tools without each tool inventing its own safety protocol. The trade-off is that tool execution has more ceremony, but the ceremony keeps session behavior auditable and prevents hidden writes from bypassing the runtime.
