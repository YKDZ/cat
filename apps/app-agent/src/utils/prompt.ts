import type { AgentToolDefinition } from "@/tools/types";

// ─── Constants ───

const TOOL_DESCRIPTIONS_VAR = "{{toolDescriptions}}";
const CONTEXT_VARIABLES_VAR = "{{contextVariables}}";

// ─── Tool Description Generation ───

/**
 * Generate a formatted listing of available tools for injection into
 * the agent system prompt. Each tool is rendered as a bullet with its
 * name and description.
 *
 * Client-side tools are annotated with `[editor]` so the LLM knows they
 * operate in the user's browser editor.
 */
export const generateToolDescriptions = (
  tools: ReadonlyArray<AgentToolDefinition>,
): string => {
  if (tools.length === 0) return "";

  const lines = tools.map((t) => {
    const tag = t.target === "client" ? " [editor]" : "";
    return `- \`${t.name}\`${tag}: ${t.description}`;
  });

  return ["Available tools:", ...lines].join("\n");
};

/**
 * Inject auto-generated tool descriptions into a system prompt.
 *
 * Only activates when the prompt explicitly contains the
 * `{{toolDescriptions}}` placeholder — replaces all occurrences with
 * the generated text. If the placeholder is absent the prompt is
 * returned unchanged, since LLM providers already receive full tool
 * definitions via the structured `tools` parameter.
 *
 * Call this **after** resolving user-supplied variables so that
 * `{{toolDescriptions}}` is treated as a reserved built-in variable.
 */
export const injectToolDescriptions = (
  systemPrompt: string,
  tools: ReadonlyArray<AgentToolDefinition>,
): string => {
  if (!systemPrompt.includes(TOOL_DESCRIPTIONS_VAR)) return systemPrompt;

  const descriptions = generateToolDescriptions(tools);
  return systemPrompt.replaceAll(TOOL_DESCRIPTIONS_VAR, descriptions);
};

// ─── Context Variable Description Generation ───

type SystemPromptVariableEntry = {
  type: string;
  source: string;
  name?: string;
  description?: string;
};

/**
 * Generate a formatted "Available context:" block from `systemPromptVariables`
 * definitions. Each variable is rendered as a bullet using its `name` (falling
 * back to the key) followed by the `{{key}}` interpolation token so that the
 * real values are substituted in the subsequent variable-resolution pass.
 *
 * Example output:
 * ```
 * Available context:
 * - Source language: {{sourceLanguageId}}
 * - Translation language: {{translationLanguageId}}
 * ```
 */
export const generateContextVariableDescriptions = (
  variables: Record<string, SystemPromptVariableEntry>,
): string => {
  const entries = Object.entries(variables);
  if (entries.length === 0) return "";

  const lines = entries.map(([key, def]) => {
    const label = def.name ?? key;
    return `- ${label}: {{${key}}}`;
  });

  return ["Available context:", ...lines].join("\n");
};

/**
 * Inject an auto-generated context variables block into a system prompt.
 *
 * Only activates when the prompt contains the `{{contextVariables}}`
 * placeholder. The generated block still contains `{{key}}` tokens, so this
 * function **must be called before** user-supplied variable substitution so
 * that those tokens are resolved in the next pass.
 */
export const injectContextVariables = (
  systemPrompt: string,
  variables: Record<string, SystemPromptVariableEntry>,
): string => {
  if (!systemPrompt.includes(CONTEXT_VARIABLES_VAR)) return systemPrompt;

  const block = generateContextVariableDescriptions(variables);
  return systemPrompt.replaceAll(CONTEXT_VARIABLES_VAR, block);
};
