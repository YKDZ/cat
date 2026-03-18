import { afterEach, describe, expect, it } from "vitest";
import * as z from "zod/v4";

import { defineGraphTask, defineGraphWorkflow } from "@/workflow/define-task";
import { TaskRegistry } from "@/workflow/task-registry";

afterEach(() => {
  TaskRegistry.reset();
});

describe("defineGraphWorkflow", () => {
  it("runs steps and reads their outputs via getStepResult", async () => {
    TaskRegistry.init();

    const multiplyTask = defineGraphTask({
      name: "math.multiply",
      input: z.object({ value: z.number() }),
      output: z.object({ value: z.number() }),
      handler: async (payload) => ({ value: payload.value * 2 }),
    });

    const workflow = defineGraphWorkflow({
      name: "math.workflow",
      input: z.object({ value: z.number() }),
      output: z.object({ total: z.number() }),
      steps: async (payload, { traceId, signal }) => {
        return [
          multiplyTask.asStep(
            { value: payload.value },
            { traceId, signal, stepId: "left" },
          ),
          multiplyTask.asStep(
            { value: payload.value + 1 },
            { traceId, signal, stepId: "right" },
          ),
        ];
      },
      handler: async (_payload, ctx) => {
        const [left] = ctx.getStepResult(multiplyTask, "left");
        const [right] = ctx.getStepResult(multiplyTask, "right");
        return {
          total: left.value + right.value,
        };
      },
    });

    const run = await workflow.run({ value: 3 });
    await expect(run.result()).resolves.toEqual({ total: 14 });
  });
});
