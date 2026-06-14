import type { ToolDefinition as LLMToolDefinition } from "@cat/plugin-core";

import { toJSONSchema } from "zod";

import type {
  AgentToolDefinition,
  ToolExecutionContext,
} from "./tool-types.ts";

/**
 * Tool registry: centrally manages registration, resolution, and execution of agent tools.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, AgentToolDefinition>();

  /**
   * Register a tool. If a tool with the same name already exists, it will be overwritten.
   *
   * @param tool - Tool definition to register
   */
  register(tool: AgentToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Resolve tools by name list, ignoring unregistered names.
   *
   * @param names - Tool name list
   * @returns - Array of matching tool definitions
   */
  resolve(names: string[]): AgentToolDefinition[] {
    return names.flatMap((name) => {
      const tool = this.tools.get(name);
      return tool ? [tool] : [];
    });
  }

  /**
   * Execute a tool by name.
   *
   * @param name - Tool name
   * @param args - Tool arguments
   * @param ctx - Tool execution context
   * @returns - Tool execution result
   * @throws - Throws if the tool is not registered
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
   * Convert a list of tool names to LLM-compatible JSON Schema tool definitions. Unregistered names are ignored.
   *
   * @param names - Tool name list
   * @returns - Array of JSON Schema tool definitions
   */
  toLLMTools(names: string[]): LLMToolDefinition[] {
    return this.resolve(names).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: toJSONSchema(tool.parameters),
    }));
  }

  /**
   * Number of currently registered tools.
   */
  get size(): number {
    return this.tools.size;
  }
}
