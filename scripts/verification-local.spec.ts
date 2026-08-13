import { EventEmitter } from "node:events";

import { describe, expect, it } from "vitest";

import type { VerificationNodeRegistry } from "./verification-executor.ts";
import { runCompleteVerification } from "./verification-local.ts";
import type { VerificationPlan } from "./verification-plan.ts";

const plan: VerificationPlan = {
  digest: "a".repeat(64),
  nodes: [
    {
      dependencies: [],
      id: "quality",
      immutableInputs: ["source-sha"],
      lane: "quality",
      requiredArtifacts: [],
      requiredRecord: true,
      resourceLane: "cpu",
      timeoutClass: "short",
    },
  ],
  schemaVersion: 1,
};

describe("local complete verification", () => {
  it("returns successfully after records and candidate cleanup complete", async () => {
    const events: string[] = [];
    const registry: VerificationNodeRegistry = {
      quality: async () => {
        events.push("verify");
      },
    };
    const signals = new EventEmitter();

    await expect(
      runCompleteVerification({
        aggregateRecords: () => undefined,
        createRegistry: () => ({
          candidates: {
            cleanup: async () => {
              events.push("cleanup");
            },
          },
          registry,
        }),
        plan,
        signals,
        sourceSha: "local-sha",
      }),
    ).resolves.toBeUndefined();
    expect(events).toEqual(["verify", "cleanup"]);
  });
});
