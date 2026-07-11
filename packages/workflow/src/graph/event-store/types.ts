import type { AgentEvent } from "#/graph/events.ts";
import type { RunId } from "#/graph/types.ts";

export type EventStore = {
  append: (event: AgentEvent) => Promise<void>;
  listByRunId: (runId: RunId) => Promise<AgentEvent[]>;
};
