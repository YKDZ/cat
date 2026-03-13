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
  startedAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown> | null;
};

export type ExternalOutputRecord = {
  runId: RunId;
  nodeId: string;
  outputType: "llm_response" | "tool_result";
  outputKey: string;
  payload: unknown;
  idempotencyKey?: string;
  createdAt: string;
};

export type Checkpointer = {
  saveRunMetadata: (
    runId: RunId,
    metadata: Omit<RunMetadata, "runId">,
  ) => Promise<void>;
  loadRunMetadata: (runId: RunId) => Promise<RunMetadata | null>;
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
