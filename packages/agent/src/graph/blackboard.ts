import * as crypto from "node:crypto";

import type {
  BlackboardSnapshot,
  NodeId,
  Patch,
  PatchMetadata,
  RunId,
} from "@/graph/types";

import {
  BlackboardSnapshotSchema,
  PatchMetadataSchema,
  PatchSchema,
} from "@/graph/types";

const nowIso = (): string => new Date().toISOString();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toRecord = (value: unknown): Record<string, unknown> => {
  if (isRecord(value)) {
    return value;
  }
  return {};
};

const setByPath = (
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void => {
  const keys = path.split(".").filter((segment) => segment.length > 0);
  if (keys.length === 0) return;

  let cursor: Record<string, unknown> = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    const next = cursor[key];
    if (!isRecord(next)) {
      const created: Record<string, unknown> = {};
      cursor[key] = created;
      cursor = created;
      continue;
    }
    cursor = next;
  }

  const last = keys[keys.length - 1];
  cursor[last] = value;
};

const deepMerge = (
  target: Record<string, unknown>,
  updates: Record<string, unknown>,
): Record<string, unknown> => {
  const merged = structuredClone(target);
  for (const [key, value] of Object.entries(updates)) {
    if (key.includes(".")) {
      setByPath(merged, key, value);
      continue;
    }

    if (isRecord(value) && isRecord(merged[key])) {
      merged[key] = deepMerge(merged[key], value);
      continue;
    }

    merged[key] = value;
  }
  return merged;
};

export class Blackboard {
  private snapshot: BlackboardSnapshot;

  constructor(args: { runId: RunId; initialData: Record<string, unknown> }) {
    const ts = nowIso();
    this.snapshot = BlackboardSnapshotSchema.parse({
      runId: args.runId,
      version: 0,
      data: structuredClone(args.initialData),
      createdAt: ts,
      updatedAt: ts,
    });
  }

  static fromSnapshot = async (
    snapshot: BlackboardSnapshot,
  ): Promise<Blackboard> => {
    const parsed = BlackboardSnapshotSchema.parse(snapshot);
    const blackboard = new Blackboard({
      runId: parsed.runId,
      initialData: {},
    });
    blackboard.snapshot = parsed;
    return blackboard;
  };

  getSnapshot = (): BlackboardSnapshot => {
    return structuredClone(this.snapshot);
  };

  applyPatch = (
    patchLike: Patch,
  ): { ok: true } | { ok: false; error: string } => {
    try {
      const patch = PatchSchema.parse(patchLike);
      if (patch.metadata.parentSnapshotVersion !== this.snapshot.version) {
        return {
          ok: false,
          error: `Patch version mismatch: expected=${this.snapshot.version}, got=${patch.metadata.parentSnapshotVersion}`,
        };
      }

      const updates = toRecord(patch.updates);
      const currentData = toRecord(this.snapshot.data);
      const mergedData = deepMerge(currentData, updates);

      this.snapshot = BlackboardSnapshotSchema.parse({
        ...this.snapshot,
        version: this.snapshot.version + 1,
        data: mergedData,
        updatedAt: nowIso(),
      });

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
}

export const createPatchMetadata = (args: {
  actorId: NodeId;
  parentSnapshotVersion: number;
}): PatchMetadata => {
  return PatchMetadataSchema.parse({
    patchId: crypto.randomUUID(),
    actorId: args.actorId,
    parentSnapshotVersion: args.parentSnapshotVersion,
    timestamp: nowIso(),
  });
};

export const buildPatch = (args: {
  actorId: NodeId;
  parentSnapshotVersion: number;
  updates: Record<string, unknown>;
}): Patch => {
  return PatchSchema.parse({
    metadata: createPatchMetadata({
      actorId: args.actorId,
      parentSnapshotVersion: args.parentSnapshotVersion,
    }),
    updates: args.updates,
  });
};
