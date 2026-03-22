import type * as z from "zod/v4";

import type { GraphDefinition, NodeDefinition } from "@/graph/types";

import type {
  TypedGraphDefinition,
  TypedGraphOptions,
  TypedNodeDef,
} from "./types";

import { registerStepHandler } from "./step-handler-registry";

/**
 * 声明一个类型安全的 DAG 工作流。
 *
 * - 编译阶段：泛型推断保证节点 input/output schema 匹配
 * - 运行时：输出标准 GraphDefinition + 注册 step handler
 * - 执行时：增强的 TransformNodeExecutor 通过 config.handler 分发
 */
export const defineTypedGraph = <
  TInput extends z.ZodType,
  TOutput extends z.ZodType,
  TNodes extends Record<string, TypedNodeDef>,
>(
  options: TypedGraphOptions<TInput, TOutput, TNodes>,
): TypedGraphDefinition<TInput, TOutput> => {
  const nodes: Record<string, NodeDefinition> = {};

  for (const [nodeId, nodeDef] of Object.entries(options.nodes)) {
    // 注册 step handler（以 graphId:nodeId 为 key 避免冲突）
    const handlerKey = `${options.id}:${nodeId}`;
    registerStepHandler(handlerKey, async (rawInput, ctx) => {
      const parsed = nodeDef.input.parse(rawInput);
      const result = await nodeDef.handler(parsed, ctx);
      return nodeDef.output.parse(result);
    });

    const nodeConfig: Record<string, unknown> = { handler: handlerKey };
    if (nodeDef.inputMapping) {
      nodeConfig["inputMapping"] = nodeDef.inputMapping;
    }
    if (nodeDef.outputMapping) {
      nodeConfig["outputMapping"] = nodeDef.outputMapping;
    }

    nodes[nodeId] = {
      id: nodeId,
      type: nodeDef.type ?? "transform",
      config: nodeConfig,
      timeoutMs: nodeDef.timeoutMs ?? 120_000,
      ...(nodeDef.retry ? { retry: nodeDef.retry } : {}),
    };
  }

  const graphDefinition: GraphDefinition = {
    id: options.id,
    version: options.version ?? "1.0.0",
    description: options.description,
    nodes,
    edges: options.edges.map((e) => ({
      from: e.from,
      to: e.to,
      ...(e.condition ? { condition: e.condition } : {}),
      ...(e.label ? { label: e.label } : {}),
    })),
    entry: options.entry,
    exit: options.exit,
    config: options.config,
  };

  return {
    graphDefinition,
    inputSchema: options.input,
    outputSchema: options.output,
    id: options.id,
    extractResult: (snapshot) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const data = snapshot.data as Record<string, unknown>;

      // First try: parse from exit node data (no outputMapping, standard write)
      const exitNodeId = options.exit?.[0] ?? options.entry;
      const exitData = data[exitNodeId as string];
      if (exitData !== undefined) {
        const safeParsed = options.output.safeParse(exitData);
        if (safeParsed.success) return safeParsed.data;
      }

      // Fallback: parse from root (outputMapping to root fields)
      return options.output.parse(data);
    },
  };
};

/**
 * 辅助函数：显式声明一个类型安全节点，允许 TypeScript 正确推断 handler 参数类型。
 *
 * 用法：`defineNode({ input: schema, output: schema, handler: async (input) => {...} })`
 */
export const defineNode = <TInput extends z.ZodType, TOutput extends z.ZodType>(
  def: TypedNodeDef<TInput, TOutput>,
): TypedNodeDef<TInput, TOutput> => def;
