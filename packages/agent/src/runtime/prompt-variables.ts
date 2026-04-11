import type {
  AgentConstraints,
  AgentSessionMetadata,
} from "@cat/shared/schema/agent";

/**
 * @zh 构造传给 PromptEngine 的变量映射。
 * @en Build the variable map passed to the PromptEngine.
 *
 * @param input - {@zh 约束与会话元数据} {@en Constraints and session metadata}
 * @returns - {@zh Prompt 变量键值映射} {@en Prompt variable key-value map}
 */
export const buildPromptVariables = (input: {
  constraints: AgentConstraints;
  metadata: AgentSessionMetadata | null;
}): Record<string, string> => ({
  projectId: input.metadata?.projectId ?? "",
  projectName: input.metadata?.projectName ?? "",
  maxTurns: String(input.constraints.maxSteps),
  documentId: input.metadata?.documentId ?? "",
  elementId:
    input.metadata?.elementId !== undefined
      ? String(input.metadata.elementId)
      : "",
  languageId: input.metadata?.languageId ?? "",
  sourceLanguageId: input.metadata?.sourceLanguageId ?? "",
});
