import type { AgentEvent } from "@/graph/events";
import type { RunId } from "@/graph/types";

export type EventStore = {
  append: (event: AgentEvent) => Promise<void>;
  listByRunId: (runId: RunId) => Promise<AgentEvent[]>;
};
