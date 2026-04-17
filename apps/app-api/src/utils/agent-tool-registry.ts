import type { PluginManager } from "@cat/plugin-core";
import type { AgentToolProviderToolDef } from "@cat/plugin-core";

import { ToolRegistry, type AgentToolDefinition } from "@cat/agent";
import {
  finishTool,
  getDocumentsTool,
  getNeighborsTool,
  getTranslationsTool,
  issueClaimTool,
  issueCreateTool,
  issueListTool,
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
 * @zh 创建服务端 Agent 工具注册表，包含内置工具与插件提供的工具。
 * @en Create the server-side agent tool registry with builtin and plugin-provided tools.
 *
 * @param pluginManager - {@zh 当前作用域的插件管理器} {@en Plugin manager for the current scope}
 * @returns - {@zh 已注册所有服务端工具的注册表} {@en Tool registry with all server-side tools registered}
 */
export const createAgentToolRegistry = (
  pluginManager: PluginManager,
): ToolRegistry => {
  const registry = new ToolRegistry();

  [
    finishTool,
    readPrecheckTool,
    updateScratchpadTool,
    getDocumentsTool,
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
