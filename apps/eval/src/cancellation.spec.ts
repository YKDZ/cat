import { EventEmitter } from "node:events";

import { describe, expect, it } from "vitest";

import {
  abortableEvaluationDelay,
  EvalInterruptedError,
  installEvaluationInterruptHandler,
  throwIfEvaluationAborted,
  waitForEvaluationInterrupt,
} from "./cancellation.ts";

describe("evaluation cancellation", () => {
  it("maps a parent abort to the typed interruption error", async () => {
    const controller = new AbortController();
    controller.abort(new EvalInterruptedError());

    expect(() => throwIfEvaluationAborted(controller.signal)).toThrow(
      EvalInterruptedError,
    );
    await expect(
      abortableEvaluationDelay(1_000, controller.signal),
    ).rejects.toBeInstanceOf(EvalInterruptedError);
  });

  it("preserves the first interruption across repeated signals", () => {
    const controller = new AbortController();
    const first = new EvalInterruptedError();
    controller.abort(first);

    expect(() => throwIfEvaluationAborted(controller.signal)).toThrow(first);
    expect(controller.signal.reason).toBe(first);
  });

  it("installs one idempotent handler for both termination signals and removes it", async () => {
    const target = new EventEmitter();
    const interrupt = installEvaluationInterruptHandler(target);
    const waiting = waitForEvaluationInterrupt(interrupt.signal);

    target.emit("SIGINT");
    target.emit("SIGTERM");

    await waiting;
    expect(() => throwIfEvaluationAborted(interrupt.signal)).toThrow(
      EvalInterruptedError,
    );
    expect(target.listenerCount("SIGINT")).toBe(1);
    expect(target.listenerCount("SIGTERM")).toBe(1);

    interrupt.dispose();
    expect(target.listenerCount("SIGINT")).toBe(0);
    expect(target.listenerCount("SIGTERM")).toBe(0);
  });
});
