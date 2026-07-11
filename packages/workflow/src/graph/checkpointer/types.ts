import type { JSONObject, NonNullJSONType } from "@cat/shared";

import type { AgentEvent } from "#/graph/events.ts";
import type {
  BlackboardSnapshot,
  GraphDefinition,
  RunId,
  RunStatus,
} from "#/graph/types.ts";

export type RunMetadata = {
  runId: RunId;
  graphId: string;
  status: RunStatus;
  graphDefinition?: GraphDefinition | undefined;
  currentNodeId?: string | undefined;
  deduplicationKey?: string | undefined;
  startedAt: string;
  completedAt?: string | undefined;
  metadata?: JSONObject | null | undefined;
};

export type ExternalOutputRecord = {
  runId: RunId;
  nodeId: string;
  outputType:
    | "llm_response"
    | "tool_result"
    | "db_write"
    | "api_call"
    | "event_publish";
  outputKey: string;
  payload: NonNullJSONType;
  idempotencyKey?: string | undefined;
  createdAt: string;
};

export type Checkpointer = {
  saveRunMetadata: (
    runId: RunId,
    metadata: Omit<RunMetadata, "runId">,
  ) => Promise<void>;
  loadRunMetadata: (runId: RunId) => Promise<RunMetadata | null>;
  findRunByDeduplicationKey: (key: string) => Promise<RunMetadata | null>;
  saveSnapshot: (runId: RunId, snapshot: BlackboardSnapshot) => Promise<void>;
  loadSnapshot: (runId: RunId) => Promise<BlackboardSnapshot | null>;
  saveEvent: (event: AgentEvent) => Promise<void>;
  listEvents: (runId: RunId) => Promise<AgentEvent[]>;
  saveExternalOutput: (record: ExternalOutputRecord) => Promise<void>;
  loadExternalOutputByIdempotency: (
    runId: RunId,
    idempotencyKey: string,
  ) => Promise<ExternalOutputRecord | null>;
};
