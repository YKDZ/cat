import type { DrizzleClient } from "@cat/domain";
import type { AgentContextProvider } from "@cat/plugin-core";
import type { AgentDefinition } from "@cat/shared/schema/agent";

import type { SeedVariables } from "@/context/resolver";
import type { AgentToolDefinition } from "@/tools/types";

import {
  createBuiltinProviders,
  resolveContextVariables,
} from "@/context/index";

// ─── Build System Prompt ───

/**
 * Build the fully-interpolated system prompt for an agent run.
 *
 * Pipeline:
 * 1. Expand seed variables (userId + session metadata fields)
 * 2. Assemble builtin providers + plugin-supplied context providers
 * 3. Run the topological context resolution engine
 * 4. Replace all {{key}} placeholders in the system prompt
 *
 * All context variables are derived from **server-side** sources to prevent
 * prompt-injection via forged client values. Plugin context providers
 * registered via the AGENT_CONTEXT_PROVIDER service can augment the
 * variable set at runtime.
 */
export const buildSystemPrompt = async (params: {
  drizzle: DrizzleClient;
  definition: AgentDefinition;
  seedsVars: Record<string, string | number | boolean>;
  userId: string;
  tools: ReadonlyArray<AgentToolDefinition>;
  /** Context providers from PluginManager.getServices("AGENT_CONTEXT_PROVIDER") */
  contextProviders?: AgentContextProvider[];
  /** Optional permission check hook (defaults to allow-all) */
  checkPermission?: (resource: string, action: string) => Promise<boolean>;
}): Promise<string> => {
  const {
    drizzle,
    definition,
    seedsVars,
    userId,
    tools,
    contextProviders = [],
    checkPermission,
  } = params;

  // 1. Build seed variables — these are the roots of the dependency graph
  const seeds: SeedVariables = new Map();
  seeds.set("userId", userId);
  Object.entries(seedsVars).forEach(([key, value]) => seeds.set(key, value));

  // 2. Assemble provider list: builtins first, then plugin-supplied providers
  const builtins = createBuiltinProviders({ definition, tools, drizzle });
  const allProviders: AgentContextProvider[] = [
    ...builtins,
    ...contextProviders,
  ];

  // 3. Run the resolution engine (handles topo-sort, cycle detection, parallel
  //    execution within the same dependency layer)
  const resolved = await resolveContextVariables({
    seeds,
    providers: allProviders,
    drizzle,
    checkPermission,
  });

  // 4. Replace all {{key}} placeholders in the system prompt.
  //    A second pass ensures tokens introduced by meta-variables
  //    ({{contextVariables}}, {{toolDescriptions}}) are also substituted.
  let systemPrompt = definition.systemPrompt;
  for (const [key, value] of resolved) {
    systemPrompt = systemPrompt.replaceAll(`{{${key}}}`, String(value));
  }
  // Second pass: substitute any tokens introduced by provider values
  for (const [key, value] of resolved) {
    systemPrompt = systemPrompt.replaceAll(`{{${key}}}`, String(value));
  }

  // 5. Remove any remaining unresolved {{key}} placeholders
  //    (variables that had no value)
  systemPrompt = systemPrompt.replace(/\{\{[^}]+\}\}/g, "");

  return systemPrompt;
};
