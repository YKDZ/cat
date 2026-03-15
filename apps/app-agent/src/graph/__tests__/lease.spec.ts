import { describe, expect, it } from "vitest";

import { InProcessLeaseManager } from "@/graph/lease";

describe("InProcessLeaseManager", () => {
  it("acquires, renews, releases, and finds expired leases", async () => {
    const leaseManager = new InProcessLeaseManager();
    const runId = "11111111-1111-4111-8111-111111111111";
    const nodeId = "node-1";

    const lease = await leaseManager.acquire(runId, nodeId, 50);
    expect(lease).not.toBeNull();

    const duplicate = await leaseManager.acquire(runId, nodeId, 50);
    expect(duplicate).toBeNull();

    const renewed = await leaseManager.renew(
      runId,
      nodeId,
      lease?.leaseId ?? "",
    );
    expect(renewed).toBe(true);

    await leaseManager.release(runId, nodeId, lease?.leaseId ?? "");

    const reacquired = await leaseManager.acquire(runId, nodeId, 10);
    expect(reacquired).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 20));
    const expired = await leaseManager.findExpired();
    expect(expired.map((item) => item.nodeId)).toContain(nodeId);
  });
});
