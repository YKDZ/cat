import type { ToolDefinition as LLMToolDefinition } from "@cat/plugin-core";

import { toJSONSchema } from "zod/v4";

import type {
  AgentToolDefinition,
  ToolExecutionContext,
} from "./tool-types.ts";

/**
 * @zh 工具注册表：统一管理 Agent 工具的注册、解析和执行。
 * @en Tool registry: centrally manages registration, resolution, and execution of agent tools.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, AgentToolDefinition>();

  /**
   * @zh 注册一个工具。重复注册同名工具时后者覆盖前者。
   * @en Register a tool. If a tool with the same name already exists, it will be overwritten.
   *
   * @param tool - {@zh 要注册的工具定义} {@en Tool definition to register}
   */
  register(tool: AgentToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * @zh 按名称列表解析工具，忽略未注册的名称。
   * @en Resolve tools by name list, ignoring unregistered names.
   *
   * @param names - {@zh 工具名称列表} {@en Tool name list}
   * @returns - {@zh 对应的工具定义数组} {@en Array of matching tool definitions}
   */
  resolve(names: string[]): AgentToolDefinition[] {
    return names.flatMap((name) => {
      const tool = this.tools.get(name);
      return tool ? [tool] : [];
    });
  }

  /**
   * @zh 执行指定名称的工具。
   * @en Execute a tool by name.
   *
   * @param name - {@zh 工具名称} {@en Tool name}
   * @param args - {@zh 工具参数} {@en Tool arguments}
   * @param ctx - {@zh 工具执行上下文} {@en Tool execution context}
   * @returns - {@zh 工具执行结果} {@en Tool execution result}
   * @throws - {@zh 工具未注册时抛出错误} {@en Throws if the tool is not registered}
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" is not registered`);
    }
    const parsed = tool.parameters.parse(args);
    return tool.execute(parsed, ctx);
  }

  /**
   * @zh 将指定工具名称列表转换为 LLM 可用的 JSON Schema 工具定义数组。未注册的名称将被忽略。
   * @en Convert a list of tool names to LLM-compatible JSON Schema tool definitions. Unregistered names are ignored.
   *
   * @param names - {@zh 工具名称列表} {@en Tool name list}
   * @returns - {@zh JSON Schema 工具定义数组} {@en Array of JSON Schema tool definitions}
   */
  toLLMTools(names: string[]): LLMToolDefinition[] {
    return this.resolve(names).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: toJSONSchema(tool.parameters),
    }));
  }

  /**
   * @zh 当前已注册的工具数量。
   * @en Number of currently registered tools.
   */
  get size(): number {
    return this.tools.size;
  }
}
