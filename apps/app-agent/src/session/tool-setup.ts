import type { AgentDefinition } from "@cat/shared/schema/agent";

import type { AgentToolDefinition } from "@/tools/types";

import { builtinTools } from "@/tools/index";
import { createToolRegistry } from "@/tools/registry";

export const setupToolRegistry = (params: {
  definition: AgentDefinition;
}): AgentToolDefinition[] => {
  const { definition } = params;

  const registry = createToolRegistry();
  for (const tool of builtinTools) {
    registry.register(tool);
  }

  return definition.tools.length > 0
    ? registry.getByNamesWithRequired(definition.tools)
    : registry.getAll();
};
