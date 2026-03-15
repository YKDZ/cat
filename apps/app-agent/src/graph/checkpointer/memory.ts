import type { AgentEvent } from "@/graph/events";
import type { BlackboardSnapshot, RunId } from "@/graph/types";

import { BlackboardSnapshotSchema } from "@/graph/types";

import type { Checkpointer, ExternalOutputRecord, RunMetadata } from "./types";

export class MemoryCheckpointer implements Checkpointer {
  private runMeta = new Map<RunId, RunMetadata>();

  private snapshots = new Map<RunId, BlackboardSnapshot>();

  private events = new Map<RunId, AgentEvent[]>();

  private externalOutputs = new Map<RunId, ExternalOutputRecord[]>();

  saveRunMetadata = async (
    runId: RunId,
    metadata: Omit<RunMetadata, "runId">,
  ): Promise<void> => {
    this.runMeta.set(runId, { ...metadata, runId });
  };

  loadRunMetadata = async (runId: RunId): Promise<RunMetadata | null> => {
    return this.runMeta.get(runId) ?? null;
  };

  findRunByDeduplicationKey = async (
    key: string,
  ): Promise<RunMetadata | null> => {
    for (const metadata of this.runMeta.values()) {
      if (metadata.deduplicationKey === key) {
        return structuredClone(metadata);
      }
    }
    return null;
  };

  saveSnapshot = async (
    runId: RunId,
    snapshot: BlackboardSnapshot,
  ): Promise<void> => {
    const parsed = BlackboardSnapshotSchema.parse(snapshot);
    this.snapshots.set(runId, structuredClone(parsed));
  };

  loadSnapshot = async (runId: RunId): Promise<BlackboardSnapshot | null> => {
    const snapshot = this.snapshots.get(runId);
    return snapshot ? structuredClone(snapshot) : null;
  };

  saveEvent = async (event: AgentEvent): Promise<void> => {
    const list = this.events.get(event.runId) ?? [];
    list.push(structuredClone(event));
    this.events.set(event.runId, list);
  };

  listEvents = async (runId: RunId): Promise<AgentEvent[]> => {
    return structuredClone(this.events.get(runId) ?? []);
  };

  saveExternalOutput = async (record: ExternalOutputRecord): Promise<void> => {
    const list = this.externalOutputs.get(record.runId) ?? [];
    const existingIndex = list.findIndex(
      (item) =>
        item.outputKey === record.outputKey &&
        item.idempotencyKey === record.idempotencyKey,
    );
    if (existingIndex >= 0) {
      list[existingIndex] = structuredClone(record);
    } else {
      list.push(structuredClone(record));
    }
    this.externalOutputs.set(record.runId, list);
  };

  loadExternalOutputByIdempotency = async (
    runId: RunId,
    idempotencyKey: string,
  ): Promise<ExternalOutputRecord | null> => {
    const list = this.externalOutputs.get(runId) ?? [];
    const found = list.find((item) => item.idempotencyKey === idempotencyKey);
    return found ? structuredClone(found) : null;
  };
}
