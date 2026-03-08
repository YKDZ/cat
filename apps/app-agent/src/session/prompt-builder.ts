import type { DrizzleClient } from "@cat/db";
import type { AgentContextProvider } from "@cat/plugin-core";
import type { AgentDefinition } from "@cat/shared/schema/agent";

import type { SeedVariables } from "@/context/resolver";
import type { AgentToolDefinition } from "@/tools/types";

import {
  createBuiltinProviders,
  resolveContextVariables,
} from "@/context/index";

import { AgentSessionMetaSchema } from "./schema";

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
  sessionMetadata: unknown;
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
    sessionMetadata,
    userId,
    tools,
    contextProviders = [],
    checkPermission,
  } = params;

  // 1. Build seed variables — these are the roots of the dependency graph
  const seeds: SeedVariables = new Map();
  seeds.set("userId", userId);

  const metaResult = AgentSessionMetaSchema.safeParse(sessionMetadata);
  if (metaResult.success) {
    const meta = metaResult.data;
    if (meta.projectId !== undefined) seeds.set("projectId", meta.projectId);
    if (meta.documentId !== undefined) seeds.set("documentId", meta.documentId);
    if (meta.elementId !== undefined) seeds.set("elementId", meta.elementId);
    if (meta.languageId !== undefined) {
      seeds.set("languageId", meta.languageId);
      // Backward-compatibility alias used by existing agent prompts
      seeds.set("translationLanguageId", meta.languageId);
    }
    if (meta.sourceLanguageId !== undefined)
      seeds.set("sourceLanguageId", meta.sourceLanguageId);
  }

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

  return systemPrompt;
};
