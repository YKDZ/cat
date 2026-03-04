import { eq, glossaryToProject, type DrizzleClient } from "@cat/db";

import type { AgentDefinition } from "@/schema/agent-definition";
import type { AgentToolDefinition } from "@/tools/types";

import { injectContextVariables, injectToolDescriptions } from "@/utils/prompt";

import { AgentSessionMetaSchema, type AgentSessionMeta } from "./schema";

// ─── Build System Prompt ───

/**
 * Build the fully-interpolated system prompt for an agent run.
 *
 * Pipeline:
 * 1. Expand `{{contextVariables}}` from definition metadata
 * 2. Resolve trusted context variables (session metadata + glossary IDs)
 * 3. Replace all `{{key}}` placeholders with concrete values
 * 4. Inject `{{toolDescriptions}}` if present
 *
 * All context variables are derived from **server-side** sources to prevent
 * prompt-injection via forged client values.
 */
export const buildSystemPrompt = async (params: {
  drizzle: DrizzleClient;
  definition: AgentDefinition;
  sessionMetadata: unknown;
  userId: string;
  tools: ReadonlyArray<AgentToolDefinition>;
}): Promise<string> => {
  const { drizzle, definition, sessionMetadata, userId, tools } = params;

  let systemPrompt = definition.systemPrompt;

  // 1. Expand {{contextVariables}} BEFORE substituting values so the
  //    generated {{key}} tokens are resolved in the subsequent loop.
  if (definition.systemPromptVariables) {
    systemPrompt = injectContextVariables(
      systemPrompt,
      definition.systemPromptVariables,
    );
  }

  // 2. Parse session metadata
  const metaResult = AgentSessionMetaSchema.safeParse(sessionMetadata);
  const meta: AgentSessionMeta = metaResult.success ? metaResult.data : {};

  // 3. Look up glossary IDs linked to the project from the DB
  const glossaryIdRows = meta.projectId
    ? await drizzle
        .select({ id: glossaryToProject.glossaryId })
        .from(glossaryToProject)
        .where(eq(glossaryToProject.projectId, meta.projectId))
    : [];

  // 4. Assemble context variables from server-side sources
  const contextVars: Record<string, string | number | boolean> = {
    userId,
    glossaryIds: JSON.stringify(glossaryIdRows.map((r) => r.id)),
  };
  if (meta.projectId) contextVars.projectId = meta.projectId;
  if (meta.languageId) contextVars.translationLanguageId = meta.languageId;
  if (meta.sourceLanguageId)
    contextVars.sourceLanguageId = meta.sourceLanguageId;
  if (meta.documentId) contextVars.documentId = meta.documentId;
  if (meta.elementId !== undefined) contextVars.elementId = meta.elementId;

  // 5. Replace all {{key}} placeholders
  for (const [key, value] of Object.entries(contextVars)) {
    systemPrompt = systemPrompt.replaceAll(`{{${key}}}`, String(value));
  }

  // 6. Inject auto-generated tool descriptions ({{toolDescriptions}})
  systemPrompt = injectToolDescriptions(systemPrompt, tools);

  return systemPrompt;
};
