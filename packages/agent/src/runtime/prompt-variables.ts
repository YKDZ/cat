import type { AgentConstraints, AgentSessionMetadata } from "@cat/shared";

/**
 * Build the variable map passed to the PromptEngine.
 *
 * @param input - Constraints and session metadata
 * @returns - Prompt variable key-value map
 */
export const buildPromptVariables = (input: {
  constraints: AgentConstraints;
  metadata: AgentSessionMetadata | null;
}): Record<string, string> => ({
  projectId: input.metadata?.projectId ?? "",
  projectName: input.metadata?.projectName ?? "",
  maxTurns: String(input.constraints.maxSteps),
  contentNodeIds: input.metadata?.contentNodeIds?.join(",") ?? "",
  currentElementContentNodeId:
    input.metadata?.currentElementContentNodeId ?? "",
  elementId:
    input.metadata?.elementId !== undefined
      ? String(input.metadata.elementId)
      : "",
  languageId: input.metadata?.languageId ?? "",
  sourceLanguageId: input.metadata?.sourceLanguageId ?? "",
});
