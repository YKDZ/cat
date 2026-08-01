import {
  claimAgentRunOwner,
  executeCommand,
  executeQuery,
  findAgentRunByDeduplicationKey,
  getAgentRunInternalId,
  listAgentEvents,
  loadAgentExternalOutputByIdempotency,
  loadAgentRunMetadata,
  loadAgentRunSnapshot,
  saveAgentEvent,
  saveAgentExternalOutput,
  saveAgentRunMetadata,
  saveAgentRunSnapshot,
  type AgentRunMetadataRow,
  type DbHandle,
  renewAgentRunOwner,
} from "@cat/domain";
import type { JSONObject, JSONType } from "@cat/shared";

import type { AgentEvent } from "#/graph/events.ts";
import { createAgentEvent } from "#/graph/events.ts";
import type { BlackboardSnapshot, RunId, RunStatus } from "#/graph/types.ts";
import { GraphDefinitionSchema, RunStatusSchema } from "#/graph/types.ts";

import type {
  Checkpointer,
  ExternalOutputRecord,
  RunMetadata,
} from "./types.ts";

const isRecord = (value: JSONType): value is JSONObject => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const toMetadataRecord = (value: JSONType): JSONObject | null => {
  if (value === null) {
    return value;
  }

  return isRecord(value) ? value : null;
};

const toRunMetadata = (row: AgentRunMetadataRow): RunMetadata => {
  const graphDefinition = GraphDefinitionSchema.safeParse(row.graphDefinition);
  const status = RunStatusSchema.safeParse(row.status);
  const metadata = toMetadataRecord(row.metadata);
  const graphId = graphDefinition.success ? graphDefinition.data.id : "unknown";

  return {
    runId: row.externalId,
    graphId,
    status: status.success ? status.data : ("running" satisfies RunStatus),
    graphDefinition: graphDefinition.success ? graphDefinition.data : undefined,
    currentNodeId: row.currentNodeId ?? undefined,
    deduplicationKey:
      row.deduplicationKey ??
      (typeof metadata?.["__schedulerDeduplicationKey"] === "string"
        ? metadata["__schedulerDeduplicationKey"]
        : undefined),
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    metadata,
    ownerId: row.ownerId,
    ownerEpoch: row.ownerEpoch,
    ownerLeaseExpiresAt: row.ownerLeaseExpiresAt?.toISOString(),
  };
};

export class PostgresCheckpointer implements Checkpointer {
  readonly #db: DbHandle;
  readonly #ownerId = crypto.randomUUID();
  readonly #ownerEpochs = new Map<RunId, number>();
  readonly #ownerLeaseMs: number;

  constructor(db: DbHandle, options?: { ownerLeaseMs?: number }) {
    this.#db = db;
    this.#ownerLeaseMs = options?.ownerLeaseMs ?? 30_000;
  }

  claimRunOwnership = async (runId: RunId): Promise<boolean> => {
    const lease = await executeCommand({ db: this.#db }, claimAgentRunOwner, {
      externalId: runId,
      ownerId: this.#ownerId,
      leaseDurationMs: this.#ownerLeaseMs,
    });
    if (!lease) return false;
    this.#ownerEpochs.set(runId, lease.epoch);
    return true;
  };

  renewRunOwnership = async (runId: RunId): Promise<boolean> => {
    const epoch = this.#ownerEpochs.get(runId);
    if (epoch === undefined) return false;
    return await executeCommand({ db: this.#db }, renewAgentRunOwner, {
      externalId: runId,
      ownerId: this.#ownerId,
      epoch,
      leaseDurationMs: this.#ownerLeaseMs,
    });
  };

  getRunOwnershipFence = (runId: RunId) => {
    const epoch = this.#ownerEpochs.get(runId);
    return epoch === undefined
      ? null
      : { runId, ownerId: this.#ownerId, epoch };
  };

  #ownerFence = (runId: RunId) => {
    const epoch = this.#ownerEpochs.get(runId);
    return epoch === undefined
      ? {}
      : { ownerId: this.#ownerId, ownerEpoch: epoch };
  };

  saveRunMetadata = async (
    runId: RunId,
    metadata: Omit<RunMetadata, "runId">,
  ): Promise<void> => {
    const {
      status,
      graphDefinition,
      currentNodeId,
      deduplicationKey,
      startedAt,
      completedAt,
      metadata: extraMeta,
    } = metadata;

    const sessionId =
      typeof extraMeta?.["sessionId"] === "number"
        ? extraMeta["sessionId"]
        : null;

    if (sessionId === null) return;

    const mergedMetadata =
      extraMeta || deduplicationKey
        ? {
            ...(extraMeta ?? {}),
            ...(deduplicationKey
              ? { __schedulerDeduplicationKey: deduplicationKey }
              : {}),
          }
        : null;

    await executeCommand({ db: this.#db }, saveAgentRunMetadata, {
      externalId: runId,
      sessionId,
      status,
      graphDefinition: graphDefinition ?? {},
      currentNodeId: currentNodeId ?? null,
      deduplicationKey: deduplicationKey ?? null,
      startedAt: startedAt ? new Date(startedAt) : new Date(),
      completedAt: completedAt ? new Date(completedAt) : null,
      metadata: mergedMetadata,
      ...this.#ownerFence(runId),
    });
  };

  loadRunMetadata = async (runId: RunId): Promise<RunMetadata | null> => {
    const row = await executeQuery({ db: this.#db }, loadAgentRunMetadata, {
      externalId: runId,
    });

    if (!row) return null;

    return toRunMetadata(row);
  };

  findRunByDeduplicationKey = async (
    key: string,
  ): Promise<RunMetadata | null> => {
    const row = await executeQuery(
      { db: this.#db },
      findAgentRunByDeduplicationKey,
      { deduplicationKey: key },
    );

    return row ? toRunMetadata(row) : null;
  };

  saveSnapshot = async (
    runId: RunId,
    snapshot: BlackboardSnapshot,
  ): Promise<void> => {
    if (
      !this.#ownerEpochs.has(runId) &&
      (await executeQuery({ db: this.#db }, getAgentRunInternalId, {
        externalId: runId,
      })) === null
    ) {
      return;
    }
    await executeCommand({ db: this.#db }, saveAgentRunSnapshot, {
      externalId: runId,
      snapshot,
      ...this.#ownerFence(runId),
    });
  };

  loadSnapshot = async (runId: RunId): Promise<BlackboardSnapshot | null> => {
    const snapshot = await executeQuery(
      { db: this.#db },
      loadAgentRunSnapshot,
      { externalId: runId },
    );

    if (snapshot === null) return null;
    // oxlint-disable-next-line no-unsafe-type-assertion -- JSONType → BlackboardSnapshot structural cast
    return snapshot as unknown as BlackboardSnapshot;
  };

  saveEvent = async (event: AgentEvent): Promise<number | null> => {
    const internalId = await executeQuery(
      { db: this.#db },
      getAgentRunInternalId,
      { externalId: event.runId },
    );
    if (internalId === null) return null;

    return await executeCommand({ db: this.#db }, saveAgentEvent, {
      runInternalId: internalId,
      eventId: event.eventId,
      parentEventId: event.parentEventId ?? null,
      nodeId: event.nodeId ?? null,
      type: event.type,
      payload: event.payload,
      timestamp: new Date(event.timestamp),
      ...this.#ownerFence(event.runId),
    });
  };

  listEvents = async (
    runId: RunId,
    afterSequence?: number,
  ): Promise<AgentEvent[]> => {
    const internalId = await executeQuery(
      { db: this.#db },
      getAgentRunInternalId,
      { externalId: runId },
    );
    if (internalId === null) return [];

    const rows = await executeQuery({ db: this.#db }, listAgentEvents, {
      runInternalId: internalId,
      ...(afterSequence === undefined ? {} : { afterSequence }),
    });

    return rows.map((row) => ({
      ...createAgentEvent({
        eventId: row.eventId,
        runId,
        parentEventId: row.parentEventId ?? undefined,
        nodeId: row.nodeId ?? undefined,
        // oxlint-disable-next-line no-unsafe-type-assertion
        type: row.type as AgentEvent["type"],
        payload: row.payload,
        timestamp: row.timestamp.toISOString(),
      }),
      sequence: row.sequence,
    }));
  };

  saveExternalOutput = async (record: ExternalOutputRecord): Promise<void> => {
    const internalId = await executeQuery(
      { db: this.#db },
      getAgentRunInternalId,
      { externalId: record.runId },
    );
    if (internalId === null) return;

    await executeCommand({ db: this.#db }, saveAgentExternalOutput, {
      runInternalId: internalId,
      nodeId: record.nodeId,
      outputType: record.outputType,
      outputKey: record.outputKey,
      payload: record.payload,
      idempotencyKey: record.idempotencyKey ?? null,
      createdAt: new Date(record.createdAt),
      ...this.#ownerFence(record.runId),
    });
  };

  loadExternalOutputByIdempotency = async (
    runId: RunId,
    idempotencyKey: string,
  ): Promise<ExternalOutputRecord | null> => {
    const internalId = await executeQuery(
      { db: this.#db },
      getAgentRunInternalId,
      { externalId: runId },
    );
    if (internalId === null) return null;

    const row = await executeQuery(
      { db: this.#db },
      loadAgentExternalOutputByIdempotency,
      { runInternalId: internalId, idempotencyKey },
    );

    if (!row) return null;

    return {
      runId,
      nodeId: row.nodeId,
      // oxlint-disable-next-line no-unsafe-type-assertion
      outputType: row.outputType as ExternalOutputRecord["outputType"],
      outputKey: row.outputKey,
      payload: row.payload,
      idempotencyKey: row.idempotencyKey ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  };
}
