import type { NodeExecutor } from "@/graph/node-registry";

import { buildPatch } from "@/graph/blackboard";
import { getStepHandler } from "@/graph/typed-dsl/step-handler-registry";

// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- runtime type checking for dynamic Blackboard data

const isStringRecord = (value: unknown): value is Record<string, string> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((v) => typeof v === "string");
};

/** 从嵌套对象按 dot-path 读取值 */
const resolvePath = (data: unknown, path: string): unknown => {
  const segments = path.split(".").filter(Boolean);
  let cursor: unknown = data;
  for (const segment of segments) {
    if (typeof cursor !== "object" || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
};

/**
 * Transform 节点执行器。
 *
 * - 若 config.handler 存在 → 从 StepHandlerRegistry 分发执行
 * - 若 config.handler 不存在 → 保持原有 identity 行为（直接 completed）
 */
export const TransformNodeExecutor: NodeExecutor = async (ctx, config) => {
  const handlerName =
    typeof config["handler"] === "string" ? config["handler"] : undefined;

  if (!handlerName) {
    // Identity 行为：无 handler 时直接完成
    return { status: "completed" };
  }

  const handler = getStepHandler(handlerName);
  if (!handler) {
    return {
      status: "error",
      error: `Step handler not found: ${handlerName}`,
    };
  }

  // 从 Blackboard snapshot 提取输入
  const data = ctx.snapshot.data as Record<string, unknown>;
  const rawInputMapping = config["inputMapping"];
  const inputMapping = isStringRecord(rawInputMapping)
    ? rawInputMapping
    : undefined;

  let input: unknown;
  if (inputMapping) {
    const mapped: Record<string, unknown> = {};
    for (const [paramKey, bbPath] of Object.entries(inputMapping)) {
      mapped[paramKey] = resolvePath(data, bbPath);
    }
    input = mapped;
  } else {
    input = data;
  }

  const result = await handler(input, {
    runId: ctx.runId,
    nodeId: ctx.nodeId,
    signal: ctx.signal,
    emit: ctx.emit,
  });

  // 将输出写回 Blackboard
  const rawOutputMapping = config["outputMapping"];
  const outputMapping = isStringRecord(rawOutputMapping)
    ? rawOutputMapping
    : undefined;
  let updates: Record<string, unknown>;

  if (outputMapping && typeof result === "object" && result !== null) {
    updates = {};
    for (const [bbPath, outputKey] of Object.entries(outputMapping)) {
      updates[bbPath] = (result as Record<string, unknown>)[outputKey];
    }
  } else {
    // 默认：以 nodeId 为 key 写入
    updates = { [ctx.nodeId]: result };
  }

  const patch = buildPatch({
    actorId: ctx.nodeId,
    parentSnapshotVersion: ctx.snapshot.version,
    updates,
  });

  return {
    status: "completed",
    patch,
    output: result,
  };
};
