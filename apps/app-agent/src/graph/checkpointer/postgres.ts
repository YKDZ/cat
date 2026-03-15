import type { DrizzleClient } from "@cat/db";
import type { NonNullJSONType } from "@cat/shared/schema/json";

import { agentEvent, agentExternalOutput, agentRun, and, eq } from "@cat/db";

import type { AgentEvent } from "@/graph/events";
import type { BlackboardSnapshot, RunId, RunStatus } from "@/graph/types";

import { createAgentEvent } from "@/graph/events";
import { GraphDefinitionSchema, RunStatusSchema } from "@/graph/types";

import type { Checkpointer, ExternalOutputRecord, RunMetadata } from "./types";

const getRunInternalId = async (
  drizzle: DrizzleClient,
  runId: RunId,
): Promise<number | null> => {
  const [row] = await drizzle
    .select({ id: agentRun.id })
    .from(agentRun)
    .where(eq(agentRun.externalId, runId))
    .limit(1);
  return row?.id ?? null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const toMetadataRecord = (
  value: unknown,
): Record<string, unknown> | null | undefined => {
  if (value === null || value === undefined) {
    return value;
  }

  return isRecord(value) ? value : null;
};

const toRunMetadata = (row: {
  externalId: RunId;
  status: string;
  graphDefinition: unknown;
  currentNodeId: string | null;
  deduplicationKey: string | null;
  startedAt: Date;
  completedAt: Date | null;
  metadata: unknown;
}): RunMetadata => {
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
  };
};

export class PostgresCheckpointer implements Checkpointer {
  readonly #drizzle: DrizzleClient;

  constructor(drizzle: DrizzleClient) {
    this.#drizzle = drizzle;
  }

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

    // externalId has defaultRandom() so Drizzle's insert type omits it.
    // We need to supply our own UUID; cast the whole object to bypass the type.
    // oxlint-disable-next-line no-unsafe-type-assertion, no-explicit-any
    const runValues = {
      externalId: runId,
      sessionId,
      status,
      graphDefinition: graphDefinition ?? {},
      currentNodeId: currentNodeId ?? null,
      deduplicationKey: deduplicationKey ?? null,
      startedAt: startedAt ? new Date(startedAt) : new Date(),
      completedAt: completedAt ? new Date(completedAt) : null,
      metadata:
        extraMeta || deduplicationKey
          ? {
              ...(extraMeta ?? {}),
              ...(deduplicationKey
                ? { __schedulerDeduplicationKey: deduplicationKey }
                : {}),
            }
          : null,
    } as any; // oxlint-disable-line no-unsafe-type-assertion, no-explicit-any

    await this.#drizzle
      .insert(agentRun)
      // oxlint-disable-next-line no-unsafe-argument
      .values(runValues)
      .onConflictDoUpdate({
        target: agentRun.externalId,
        set: {
          status,
          graphDefinition: graphDefinition ?? {},
          currentNodeId: currentNodeId ?? null,
          deduplicationKey: deduplicationKey ?? null,
          metadata:
            // oxlint-disable-next-line no-unsafe-type-assertion
            (extraMeta || deduplicationKey
              ? {
                  ...(extraMeta ?? {}),
                  ...(deduplicationKey
                    ? { __schedulerDeduplicationKey: deduplicationKey }
                    : {}),
                }
              : null) as unknown as NonNullJSONType,
          completedAt: completedAt ? new Date(completedAt) : null,
        },
      });
  };

  loadRunMetadata = async (runId: RunId): Promise<RunMetadata | null> => {
    const [row] = await this.#drizzle
      .select({
        externalId: agentRun.externalId,
        status: agentRun.status,
        graphDefinition: agentRun.graphDefinition,
        currentNodeId: agentRun.currentNodeId,
        deduplicationKey: agentRun.deduplicationKey,
        startedAt: agentRun.startedAt,
        completedAt: agentRun.completedAt,
        metadata: agentRun.metadata,
      })
      .from(agentRun)
      .where(eq(agentRun.externalId, runId))
      .limit(1);

    if (!row) return null;

    return toRunMetadata(row);
  };

  findRunByDeduplicationKey = async (
    key: string,
  ): Promise<RunMetadata | null> => {
    const [row] = await this.#drizzle
      .select({
        externalId: agentRun.externalId,
        status: agentRun.status,
        graphDefinition: agentRun.graphDefinition,
        currentNodeId: agentRun.currentNodeId,
        deduplicationKey: agentRun.deduplicationKey,
        startedAt: agentRun.startedAt,
        completedAt: agentRun.completedAt,
        metadata: agentRun.metadata,
      })
      .from(agentRun)
      .where(eq(agentRun.deduplicationKey, key))
      .limit(1);

    return row ? toRunMetadata(row) : null;
  };

  saveSnapshot = async (
    runId: RunId,
    snapshot: BlackboardSnapshot,
  ): Promise<void> => {
    await this.#drizzle
      .update(agentRun)
      .set({
        // oxlint-disable-next-line no-unsafe-type-assertion
        blackboardSnapshot: snapshot as unknown as NonNullJSONType,
      })
      .where(eq(agentRun.externalId, runId));
  };

  loadSnapshot = async (runId: RunId): Promise<BlackboardSnapshot | null> => {
    const [row] = await this.#drizzle
      .select({ blackboardSnapshot: agentRun.blackboardSnapshot })
      .from(agentRun)
      .where(eq(agentRun.externalId, runId))
      .limit(1);

    if (!row?.blackboardSnapshot) return null;
    // oxlint-disable-next-line no-unsafe-type-assertion
    return row.blackboardSnapshot as unknown as BlackboardSnapshot;
  };

  saveEvent = async (event: AgentEvent): Promise<void> => {
    const internalId = await getRunInternalId(this.#drizzle, event.runId);
    if (internalId === null) return;

    await this.#drizzle
      .insert(agentEvent)
      .values({
        runId: internalId,
        eventId: event.eventId,
        parentEventId: event.parentEventId ?? null,
        nodeId: event.nodeId ?? null,
        type: event.type,
        // oxlint-disable-next-line no-unsafe-type-assertion
        payload: event.payload as unknown as NonNullJSONType,
        timestamp: new Date(event.timestamp),
      })
      .onConflictDoNothing();
  };

  listEvents = async (runId: RunId): Promise<AgentEvent[]> => {
    const internalId = await getRunInternalId(this.#drizzle, runId);
    if (internalId === null) return [];

    const rows = await this.#drizzle
      .select({
        eventId: agentEvent.eventId,
        parentEventId: agentEvent.parentEventId,
        nodeId: agentEvent.nodeId,
        type: agentEvent.type,
        payload: agentEvent.payload,
        timestamp: agentEvent.timestamp,
      })
      .from(agentEvent)
      .where(eq(agentEvent.runId, internalId))
      .orderBy(agentEvent.timestamp);

    return rows.map((row) =>
      createAgentEvent({
        eventId: row.eventId,
        runId,
        parentEventId: row.parentEventId ?? undefined,
        nodeId: row.nodeId ?? undefined,
        // oxlint-disable-next-line no-unsafe-type-assertion
        type: row.type as AgentEvent["type"],
        payload: row.payload,
        timestamp: row.timestamp.toISOString(),
      }),
    );
  };

  saveExternalOutput = async (record: ExternalOutputRecord): Promise<void> => {
    const internalId = await getRunInternalId(this.#drizzle, record.runId);
    if (internalId === null) return;

    await this.#drizzle
      .insert(agentExternalOutput)
      .values({
        runId: internalId,
        nodeId: record.nodeId,
        outputType: record.outputType,
        outputKey: record.outputKey,
        // oxlint-disable-next-line no-unsafe-type-assertion
        payload: record.payload as NonNullJSONType,
        idempotencyKey: record.idempotencyKey ?? null,
        createdAt: new Date(record.createdAt),
      })
      .onConflictDoNothing();
  };

  loadExternalOutputByIdempotency = async (
    runId: RunId,
    idempotencyKey: string,
  ): Promise<ExternalOutputRecord | null> => {
    const internalId = await getRunInternalId(this.#drizzle, runId);
    if (internalId === null) return null;

    const [row] = await this.#drizzle
      .select({
        nodeId: agentExternalOutput.nodeId,
        outputType: agentExternalOutput.outputType,
        outputKey: agentExternalOutput.outputKey,
        payload: agentExternalOutput.payload,
        idempotencyKey: agentExternalOutput.idempotencyKey,
        createdAt: agentExternalOutput.createdAt,
      })
      .from(agentExternalOutput)
      .where(
        and(
          eq(agentExternalOutput.runId, internalId),
          eq(agentExternalOutput.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);

    if (!row) return null;

    return {
      runId,
      nodeId: row.nodeId,
      // oxlint-disable-next-line no-unsafe-type-assertion
      outputType: row.outputType as ExternalOutputRecord["outputType"],
      outputKey: row.outputKey,
      payload: row.payload as ExternalOutputRecord["payload"],
      idempotencyKey: row.idempotencyKey ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  };
}
