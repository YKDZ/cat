import type { JSONObject, NonNullJSONType } from "@cat/shared/schema/json";

import type { AgentEvent } from "@/graph/events";
import type {
  BlackboardSnapshot,
  GraphDefinition,
  RunId,
  RunStatus,
} from "@/graph/types";

export type RunMetadata = {
  runId: RunId;
  graphId: string;
  status: RunStatus;
  graphDefinition?: GraphDefinition;
  currentNodeId?: string;
  deduplicationKey?: string;
  startedAt: string;
  completedAt?: string;
  metadata?: JSONObject | null;
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
  idempotencyKey?: string;
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
