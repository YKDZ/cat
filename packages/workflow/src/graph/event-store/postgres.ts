import type { AgentEvent } from "#/graph/events.ts";
import type { RunId } from "#/graph/types.ts";

import type { EventStore } from "./types.ts";

/**
 * Postgres EventStore（阶段 1 占位实现）
 */
export class PostgresEventStore implements EventStore {
  append = async (_event: AgentEvent): Promise<void> => {
    throw new Error("PostgresEventStore.append is not implemented yet");
  };

  listByRunId = async (_runId: RunId): Promise<AgentEvent[]> => {
    throw new Error("PostgresEventStore.listByRunId is not implemented yet");
  };
}
