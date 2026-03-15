import { afterEach, describe, expect, it } from "vitest";
import * as z from "zod/v4";

import { defineGraphTask } from "@/workflow/define-task";
import { TaskRegistry } from "@/workflow/task-registry";

afterEach(() => {
  TaskRegistry.reset();
});

describe("defineGraphTask", () => {
  it("caches successful task outputs", async () => {
    TaskRegistry.init();
    let executionCount = 0;

    const task = defineGraphTask({
      name: "task.cache",
      input: z.object({ value: z.string() }),
      output: z.object({ value: z.string() }),
      cache: { enabled: true },
      handler: async (payload) => {
        executionCount += 1;
        return payload;
      },
    });

    const first = await task.run({ value: "hello" });
    const second = await task.run({ value: "hello" });

    expect(await first.result()).toEqual({ value: "hello" });
    expect(await second.result()).toEqual({ value: "hello" });
    expect(executionCount).toBe(1);
  });

  it("executes rollback callbacks in reverse order when the handler fails", async () => {
    TaskRegistry.init();
    const calls: string[] = [];

    const task = defineGraphTask({
      name: "task.rollback",
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      handler: async (_payload, ctx) => {
        ctx.onRollback(async () => {
          calls.push("first");
        });
        ctx.onRollback(async () => {
          calls.push("second");
        });
        throw new Error("boom");
      },
    });

    const run = await task.run({});
    await expect(run.result()).rejects.toThrow("boom");
    expect(calls).toEqual(["second", "first"]);
  });
});
