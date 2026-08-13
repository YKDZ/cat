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
  ownerId?: string | null | undefined;
  ownerEpoch?: number | undefined;
  ownerLeaseExpiresAt?: string | undefined;
};
export type RunOwnershipFence = {
  runId: RunId;
  ownerId: string;
  epoch: number;
};

export type CreateOrClaimRunOwnershipInput = {
  runId: RunId;
  sessionId?: number | undefined;
  graphId: string;
  graphDefinition: GraphDefinition;
  deduplicationKey?: string | undefined;
  metadata?: JSONObject | null | undefined;
  startedAt: string;
};

export type RunOwnershipClaim =
  | {
      kind: "claimed";
      metadata: RunMetadata;
      ownershipFence: RunOwnershipFence | null;
      created: boolean;
    }
  | { kind: "conflict"; runId: RunId }
  | {
      kind: "identity-conflict";
      externalIdRunId: RunId;
      deduplicationKeyRunId: RunId;
    };

export type RunOwnershipAcquisition = (
  input: CreateOrClaimRunOwnershipInput,
) => Promise<RunOwnershipClaim>;

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
  createOrClaimRunOwnership: (
    input: CreateOrClaimRunOwnershipInput,
  ) => Promise<RunOwnershipClaim>;
  registerRunOwnershipFence: (ownershipFence: RunOwnershipFence) => void;
  saveRunMetadata: (
    runId: RunId,
    metadata: Omit<RunMetadata, "runId">,
  ) => Promise<void>;
  loadRunMetadata: (runId: RunId) => Promise<RunMetadata | null>;
  findRunByDeduplicationKey: (key: string) => Promise<RunMetadata | null>;
  claimRunOwnership: (runId: RunId) => Promise<boolean>;
  renewRunOwnership: (runId: RunId) => Promise<boolean>;
  getRunOwnershipFence: (runId: RunId) => RunOwnershipFence | null;
  discardUnstartedRun: (runId: RunId) => Promise<boolean>;
  saveSnapshot: (runId: RunId, snapshot: BlackboardSnapshot) => Promise<void>;
  loadSnapshot: (runId: RunId) => Promise<BlackboardSnapshot | null>;
  saveEvent: (event: AgentEvent) => Promise<number | null>;
  listEvents: (runId: RunId, afterSequence?: number) => Promise<AgentEvent[]>;
  saveExternalOutput: (record: ExternalOutputRecord) => Promise<void>;
  loadExternalOutputByIdempotency: (
    runId: RunId,
    idempotencyKey: string,
  ) => Promise<ExternalOutputRecord | null>;
};
