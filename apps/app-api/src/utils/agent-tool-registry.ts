import type { PluginManager } from "@cat/plugin-core";
import type { AgentToolProviderToolDef } from "@cat/plugin-core";

import { ToolRegistry, type AgentToolDefinition } from "@cat/agent";
import {
  finishTool,
  getNeighborsTool,
  getTranslationsTool,
  issueClaimTool,
  issueCreateTool,
  issueListTool,
  listContentNodesTool,
  listElementsTool,
  prCreateTool,
  prUpdateTool,
  qaCheckTool,
  readPrecheckTool,
  searchTermbaseTool,
  searchTmTool,
  submitTranslationTool,
  updateScratchpadTool,
} from "@cat/agent-tools";

const adaptPluginTool = (
  tool: AgentToolProviderToolDef,
): AgentToolDefinition | null => {
  if (tool.target === "client" || !tool.execute) return null;

  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    sideEffectType: "external",
    toolSecurityLevel:
      tool.confirmationPolicy === "always_confirm" ? "privileged" : "standard",
    execute: async (args, ctx) => {
      return tool.execute?.(args, {
        traceId: `${ctx.session.sessionId}:${ctx.session.agentId}`,
        sessionId: ctx.session.sessionId,
      });
    },
  };
};

/**
 * Create the server-side agent tool registry with builtin and plugin-provided tools.
 *
 * @param pluginManager - Plugin manager for the current scope
 * @returns - Tool registry with all server-side tools registered
 */
export const createAgentToolRegistry = (
  pluginManager: PluginManager,
): ToolRegistry => {
  const registry = new ToolRegistry();

  [
    finishTool,
    readPrecheckTool,
    updateScratchpadTool,
    listContentNodesTool,
    searchTmTool,
    searchTermbaseTool,
    qaCheckTool,
    listElementsTool,
    getNeighborsTool,
    getTranslationsTool,
    submitTranslationTool,
    issueCreateTool,
    issueListTool,
    issueClaimTool,
    prCreateTool,
    prUpdateTool,
  ].forEach((tool) => {
    registry.register(tool);
  });

  for (const provider of pluginManager.getServices("AGENT_TOOL_PROVIDER")) {
    for (const tool of provider.service.getTools()) {
      const adapted = adaptPluginTool(tool);
      if (adapted) registry.register(adapted);
    }
  }

  return registry;
};
