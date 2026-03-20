import { afterEach, describe, expect, it } from "vitest";
import * as z from "zod/v4";

import {
  defineGraphTask,
  defineGraphWorkflow,
  stage,
} from "@/workflow/define-task";
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

  it("按 stage 顺序串行执行，stage 内部并行", async () => {
    TaskRegistry.init();
    const executionOrder: string[] = [];

    const trackTask = defineGraphTask({
      name: "test.track",
      input: z.object({ id: z.string(), delayMs: z.number() }),
      output: z.object({ id: z.string() }),
      handler: async (payload) => {
        executionOrder.push(`start:${payload.id}`);
        await new Promise((resolve) => setTimeout(resolve, payload.delayMs));
        executionOrder.push(`end:${payload.id}`);
        return { id: payload.id };
      },
    });

    const workflow = defineGraphWorkflow({
      name: "test.staged-order",
      input: z.object({}),
      output: z.object({ order: z.array(z.string()) }),
      steps: () => [
        {
          label: "stage-1",
          steps: [
            trackTask.asStep({ id: "a", delayMs: 50 }, { stepId: "a" }),
            trackTask.asStep({ id: "b", delayMs: 10 }, { stepId: "b" }),
          ],
        },
        {
          label: "stage-2",
          steps: [trackTask.asStep({ id: "c", delayMs: 10 }, { stepId: "c" })],
        },
      ],
      handler: async () => {
        return { order: executionOrder };
      },
    });

    const run = await workflow.run({});
    const result = await run.result();

    const startC = result.order.indexOf("start:c");
    const endA = result.order.indexOf("end:a");
    const endB = result.order.indexOf("end:b");

    // stage-1 的 a 和 b 都结束后 c 才开始
    expect(endA).toBeLessThan(startC);
    expect(endB).toBeLessThan(startC);
  });

  it("stage 辅助函数构造等价于对象字面量", async () => {
    TaskRegistry.init();

    const noopTask = defineGraphTask({
      name: "test.noop-stage-helper",
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      handler: async () => ({ ok: true }),
    });

    const step = noopTask.asStep({}, { stepId: "x" });
    const built = stage("my-label", step);

    expect(built).toEqual({ label: "my-label", steps: [step] });
  });

  it("空 stage 被安全跳过", async () => {
    TaskRegistry.init();

    const noopTask = defineGraphTask({
      name: "test.noop-empty",
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      handler: async () => ({ ok: true }),
    });

    const workflow = defineGraphWorkflow({
      name: "test.empty-stage",
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      steps: () => [
        { label: "empty", steps: [] },
        { label: "real", steps: [noopTask.asStep({}, { stepId: "x" })] },
      ],
      handler: async (_payload, ctx) => {
        const [result] = ctx.getStepResult(noopTask, "x");
        return { ok: result.ok };
      },
    });

    const run = await workflow.run({});
    await expect(run.result()).resolves.toEqual({ ok: true });
  });

  it("扁平数组向后兼容：仍全并行执行", async () => {
    TaskRegistry.init();

    const multiplyTask = defineGraphTask({
      name: "math.multiply-compat",
      input: z.object({ value: z.number() }),
      output: z.object({ value: z.number() }),
      handler: async (payload) => ({ value: payload.value * 2 }),
    });

    const workflow = defineGraphWorkflow({
      name: "test.compat",
      input: z.object({ value: z.number() }),
      output: z.object({ total: z.number() }),
      steps: async (payload, { traceId, signal }) => [
        multiplyTask.asStep(
          { value: payload.value },
          { traceId, signal, stepId: "left" },
        ),
        multiplyTask.asStep(
          { value: payload.value + 1 },
          { traceId, signal, stepId: "right" },
        ),
      ],
      handler: async (_payload, ctx) => {
        const [left] = ctx.getStepResult(multiplyTask, "left");
        const [right] = ctx.getStepResult(multiplyTask, "right");
        return { total: left.value + right.value };
      },
    });

    const run = await workflow.run({ value: 3 });
    await expect(run.result()).resolves.toEqual({ total: 14 });
  });
});
