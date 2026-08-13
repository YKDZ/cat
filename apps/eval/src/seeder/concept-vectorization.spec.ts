import { describe, expect, it, vi } from "vitest";

import { completeEvalConceptVectorization } from "./seeder.ts";

describe("completeEvalConceptVectorization", () => {
  it("fails closed when a recoverable consumer failure leaves work pending", async () => {
    const processBatch = vi.fn().mockResolvedValue(undefined);
    const queue = { pendingCount: vi.fn().mockResolvedValue(1) };

    await expect(
      completeEvalConceptVectorization(
        queue as never,
        1,
        { traceId: "eval-test" },
        processBatch,
      ),
    ).rejects.toThrow(
      "Eval concept vectorization did not complete through the configured vector storage.",
    );
    expect(processBatch).toHaveBeenCalledWith(queue, 1, {
      traceId: "eval-test",
    });
    expect(queue.pendingCount).toHaveBeenCalledOnce();
  });
});
