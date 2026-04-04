import * as crypto from "node:crypto";

import type { NodeId, RunId } from "@/graph/types";

export type LeaseStatus = "active" | "expired" | "released";

export type LeaseRecord = {
  runId: RunId;
  nodeId: NodeId;
  leaseId: string;
  acquiredAt: string;
  expiresAt: string;
  lastHeartbeatAt: string;
  heartbeatIntervalMs: number;
  status: LeaseStatus;
};

export type LeaseManager = {
  acquire: (
    runId: RunId,
    nodeId: NodeId,
    durationMs: number,
  ) => Promise<LeaseRecord | null>;
  renew: (runId: RunId, nodeId: NodeId, leaseId: string) => Promise<boolean>;
  release: (runId: RunId, nodeId: NodeId, leaseId: string) => Promise<void>;
  findExpired: () => Promise<LeaseRecord[]>;
};

const toKey = (runId: RunId, nodeId: NodeId): string => `${runId}:${nodeId}`;

const nowIso = (): string => new Date().toISOString();

const toLeaseRecord = (
  runId: RunId,
  nodeId: NodeId,
  leaseId: string,
  durationMs: number,
): LeaseRecord => {
  const acquiredAtDate = new Date();
  return {
    runId,
    nodeId,
    leaseId,
    acquiredAt: acquiredAtDate.toISOString(),
    expiresAt: new Date(acquiredAtDate.getTime() + durationMs).toISOString(),
    lastHeartbeatAt: acquiredAtDate.toISOString(),
    heartbeatIntervalMs: Math.max(100, Math.floor(durationMs / 3)),
    status: "active",
  };
};

export class InProcessLeaseManager implements LeaseManager {
  private readonly leases = new Map<string, LeaseRecord>();

  acquire = async (
    runId: RunId,
    nodeId: NodeId,
    durationMs: number,
  ): Promise<LeaseRecord | null> => {
    const key = toKey(runId, nodeId);
    const current = this.leases.get(key);
    const now = Date.now();
    if (
      current &&
      current.status === "active" &&
      new Date(current.expiresAt).getTime() > now
    ) {
      return null;
    }

    const lease = toLeaseRecord(runId, nodeId, crypto.randomUUID(), durationMs);
    this.leases.set(key, lease);
    return structuredClone(lease);
  };

  renew = async (
    runId: RunId,
    nodeId: NodeId,
    leaseId: string,
  ): Promise<boolean> => {
    const key = toKey(runId, nodeId);
    const current = this.leases.get(key);
    if (
      !current ||
      current.leaseId !== leaseId ||
      current.status !== "active"
    ) {
      return false;
    }

    const durationMs =
      new Date(current.expiresAt).getTime() -
      new Date(current.acquiredAt).getTime();
    const currentTime = new Date();
    current.lastHeartbeatAt = currentTime.toISOString();
    current.expiresAt = new Date(
      currentTime.getTime() + durationMs,
    ).toISOString();
    this.leases.set(key, current);
    return true;
  };

  release = async (
    runId: RunId,
    nodeId: NodeId,
    leaseId: string,
  ): Promise<void> => {
    const key = toKey(runId, nodeId);
    const current = this.leases.get(key);
    if (!current || current.leaseId !== leaseId) return;
    current.status = "released";
    current.lastHeartbeatAt = nowIso();
    this.leases.set(key, current);
  };

  findExpired = async (): Promise<LeaseRecord[]> => {
    const now = Date.now();
    const expired: LeaseRecord[] = [];
    for (const [key, lease] of this.leases.entries()) {
      if (lease.status !== "active") continue;
      if (new Date(lease.expiresAt).getTime() > now) continue;
      lease.status = "expired";
      this.leases.set(key, lease);
      expired.push(structuredClone(lease));
    }
    return expired;
  };
}
