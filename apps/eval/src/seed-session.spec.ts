import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import {
  EvalInterruptedError,
  installEvaluationInterruptHandler,
} from "./cancellation.ts";
import { runSeedSession } from "./seed-session.ts";

describe("runSeedSession", () => {
  it("cleans a ready seed once before reporting repeated SIGTERM/SIGINT interruption", async () => {
    const target = new EventEmitter();
    const interrupt = installEvaluationInterruptHandler(target);
    const events: string[] = [];
    const cleanup = vi.fn(async () => {
      events.push("cleanup");
    });

    await expect(
      runSeedSession({
        signal: interrupt.signal,
        seed: async () => ({ cleanup }),
        onReady: () => {
          events.push("ready");
          target.emit("SIGTERM");
          target.emit("SIGINT");
        },
      }),
    ).rejects.toBeInstanceOf(EvalInterruptedError);

    events.push("reported");
    expect(cleanup).toHaveBeenCalledOnce();
    expect(events).toEqual(["ready", "cleanup", "reported"]);
    interrupt.dispose();
    expect(target.listenerCount("SIGINT")).toBe(0);
    expect(target.listenerCount("SIGTERM")).toBe(0);
  });
});
