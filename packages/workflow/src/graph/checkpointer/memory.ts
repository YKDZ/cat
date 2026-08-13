import type { AgentEvent } from "#/graph/events.ts";
import type { BlackboardSnapshot, RunId } from "#/graph/types.ts";
import { BlackboardSnapshotSchema } from "#/graph/types.ts";

import type {
  Checkpointer,
  CreateOrClaimRunOwnershipInput,
  ExternalOutputRecord,
  RunMetadata,
  RunOwnershipClaim,
  RunOwnershipFence,
} from "./types.ts";

export class MemoryCheckpointer implements Checkpointer {
  private runMeta = new Map<RunId, RunMetadata>();

  private snapshots = new Map<RunId, BlackboardSnapshot>();

  private events = new Map<RunId, AgentEvent[]>();

  private externalOutputs = new Map<RunId, ExternalOutputRecord[]>();

  readonly #ownerId = crypto.randomUUID();

  readonly #ownerEpochs = new Map<RunId, number>();

  createOrClaimRunOwnership = async (
    input: CreateOrClaimRunOwnershipInput,
  ): Promise<RunOwnershipClaim> => {
    const existing = this.runMeta.get(input.runId);
    const now = Date.now();
    if (
      existing &&
      existing.ownerId !== undefined &&
      existing.ownerId !== null &&
      existing.ownerId !== this.#ownerId &&
      existing.ownerLeaseExpiresAt !== undefined &&
      new Date(existing.ownerLeaseExpiresAt).getTime() > now
    ) {
      return { kind: "conflict", runId: input.runId };
    }

    const created = existing === undefined;
    const currentEpoch = existing?.ownerEpoch ?? 0;
    const hasLiveSameOwnerLease =
      existing?.ownerId === this.#ownerId &&
      existing.ownerLeaseExpiresAt !== undefined &&
      new Date(existing.ownerLeaseExpiresAt).getTime() > now;
    const epoch = hasLiveSameOwnerLease ? currentEpoch : currentEpoch + 1;
    const ownerLeaseExpiresAt = new Date(now + 30_000).toISOString();
    const metadata: RunMetadata = created
      ? {
          runId: input.runId,
          graphId: input.graphId,
          status: "running",
          graphDefinition: input.graphDefinition,
          deduplicationKey: input.deduplicationKey,
          startedAt: input.startedAt,
          metadata: input.metadata,
          ownerId: this.#ownerId,
          ownerEpoch: epoch,
          ownerLeaseExpiresAt,
        }
      : {
          ...existing,
          ownerId: this.#ownerId,
          ownerEpoch: epoch,
          ownerLeaseExpiresAt,
        };
    this.runMeta.set(input.runId, metadata);
    this.#ownerEpochs.set(input.runId, epoch);
    const ownershipFence: RunOwnershipFence = {
      runId: input.runId,
      ownerId: this.#ownerId,
      epoch,
    };
    return { kind: "claimed", metadata, ownershipFence, created };
  };

  registerRunOwnershipFence = (ownershipFence: {
    runId: RunId;
    ownerId: string;
    epoch: number;
  }): void => {
    if (ownershipFence.ownerId !== this.#ownerId) {
      throw new Error(
        "Cannot register a workflow fence owned by another runtime.",
      );
    }
    this.#ownerEpochs.set(ownershipFence.runId, ownershipFence.epoch);
  };

  saveRunMetadata = async (
    runId: RunId,
    metadata: Omit<RunMetadata, "runId">,
  ): Promise<void> => {
    const current = this.runMeta.get(runId);
    if (
      current?.ownerId !== undefined &&
      current.ownerId !== null &&
      current.ownerId !== this.#ownerId &&
      current.ownerLeaseExpiresAt !== undefined &&
      new Date(current.ownerLeaseExpiresAt).getTime() > Date.now()
    ) {
      throw new Error("Workflow owner lease lost.");
    }
    this.runMeta.set(runId, {
      ...current,
      ...metadata,
      runId,
      ...(current?.ownerId === undefined
        ? {}
        : {
            ownerId: current.ownerId,
            ownerEpoch: current.ownerEpoch,
            ownerLeaseExpiresAt: current.ownerLeaseExpiresAt,
          }),
    });
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

  claimRunOwnership = async (runId: RunId): Promise<boolean> => {
    const existing = this.runMeta.get(runId);
    if (!existing?.graphDefinition) return false;
    const claim = await this.createOrClaimRunOwnership({
      runId,
      graphId: existing.graphId,
      graphDefinition: existing.graphDefinition,
      deduplicationKey: existing.deduplicationKey,
      metadata: existing.metadata,
      startedAt: existing.startedAt,
    });
    return claim.kind === "claimed";
  };
  renewRunOwnership = async (runId: RunId): Promise<boolean> => {
    const epoch = this.#ownerEpochs.get(runId);
    const current = this.runMeta.get(runId);
    if (
      epoch === undefined ||
      current?.ownerId !== this.#ownerId ||
      current.ownerEpoch !== epoch ||
      current.ownerLeaseExpiresAt === undefined ||
      new Date(current.ownerLeaseExpiresAt).getTime() <= Date.now()
    ) {
      return false;
    }
    current.ownerLeaseExpiresAt = new Date(Date.now() + 30_000).toISOString();
    return true;
  };
  getRunOwnershipFence = (runId: RunId): RunOwnershipFence | null => {
    const epoch = this.#ownerEpochs.get(runId);
    return epoch === undefined
      ? null
      : { runId, ownerId: this.#ownerId, epoch };
  };

  discardUnstartedRun = async (runId: RunId): Promise<boolean> => {
    const metadata = this.runMeta.get(runId);
    const epoch = this.#ownerEpochs.get(runId);
    if (
      !metadata ||
      epoch === undefined ||
      metadata.ownerId !== this.#ownerId ||
      metadata.ownerEpoch !== epoch ||
      (metadata.status !== "running" && metadata.status !== "paused") ||
      this.snapshots.has(runId) ||
      (this.events.get(runId)?.length ?? 0) > 0 ||
      (this.externalOutputs.get(runId)?.length ?? 0) > 0
    ) {
      return false;
    }
    this.runMeta.delete(runId);
    this.#ownerEpochs.delete(runId);
    return true;
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

  saveEvent = async (event: AgentEvent): Promise<number> => {
    const list = this.events.get(event.runId) ?? [];
    const existing = list.find(
      (candidate) => candidate.eventId === event.eventId,
    );
    if (existing?.sequence) return existing.sequence;
    const sequence = (list.at(-1)?.sequence ?? 0) + 1;
    list.push({ ...structuredClone(event), sequence });
    this.events.set(event.runId, list);
    return sequence;
  };

  listEvents = async (
    runId: RunId,
    afterSequence?: number,
  ): Promise<AgentEvent[]> => {
    return structuredClone(
      (this.events.get(runId) ?? []).filter(
        (event) =>
          afterSequence === undefined || (event.sequence ?? 0) > afterSequence,
      ),
    );
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
