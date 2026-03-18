import type { AgentToolDefinition } from "./types";

// ─── Tool Registry ───

export class ToolRegistry {
  private tools = new Map<string, AgentToolDefinition>();

  /** Register a tool definition */
  register = (tool: AgentToolDefinition): void => {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  };

  /** Unregister a tool by name */
  unregister = (name: string): boolean => {
    return this.tools.delete(name);
  };

  /** Get a tool by name */
  get = (name: string): AgentToolDefinition | undefined => {
    return this.tools.get(name);
  };

  /** Get all registered tools */
  getAll = (): AgentToolDefinition[] => {
    return [...this.tools.values()];
  };

  /** Get tools filtered by a list of allowed names */
  getByNames = (names: string[]): AgentToolDefinition[] => {
    const nameSet = new Set(names);
    return this.getAll().filter((t) => nameSet.has(t.name));
  };

  /**
   * Get tools filtered by allowed names, but always include tools marked
   * with `isFinishTool: true` regardless of the names list.
   * This ensures the agent always has a way to explicitly terminate.
   */
  getByNamesWithRequired = (names: string[]): AgentToolDefinition[] => {
    const nameSet = new Set(names);
    return this.getAll().filter((t) => nameSet.has(t.name) || t.isFinishTool);
  };

  /** Check if a tool is registered */
  has = (name: string): boolean => {
    return this.tools.has(name);
  };

  /** Get the count of registered tools */
  get size(): number {
    return this.tools.size;
  }
}

/** Create a new ToolRegistry instance */
export const createToolRegistry = (): ToolRegistry => new ToolRegistry();
