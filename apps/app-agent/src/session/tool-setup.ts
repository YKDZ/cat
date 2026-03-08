import type { AgentDefinition } from "@cat/shared/schema/agent";

import type { AgentToolDefinition } from "@/tools/types";

import { builtinClientTools, builtinTools } from "@/tools/index";
import { createToolRegistry } from "@/tools/registry";

/**
 * Create a tool registry populated with the builtin tools that match the
 * agent definition's tool list.
 *
 * @param includeClientTools - Pass `true` when the caller can interact with
 *   the user's browser (i.e. streaming endpoint). Workers that run without a
 *   frontend connection should pass `false`.
 */
export const setupToolRegistry = (params: {
  definition: AgentDefinition;
  includeClientTools: boolean;
}): AgentToolDefinition[] => {
  const { definition, includeClientTools } = params;

  const registry = createToolRegistry();
  for (const tool of builtinTools) {
    registry.register(tool);
  }
  if (includeClientTools) {
    for (const tool of builtinClientTools) {
      registry.register(tool);
    }
  }

  return definition.tools.length > 0
    ? registry.getByNamesWithRequired(definition.tools)
    : registry.getAll();
};
