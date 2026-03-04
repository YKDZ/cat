import * as z from "zod/v4";

// ─── LLM Configuration ───

export const AgentLLMConfigSchema = z.object({
  /** PluginService DB ID referencing an LLM_PROVIDER instance */
  providerId: z.int(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.int().positive().optional(),
});

// ─── System Prompt Variable ───

export const SystemPromptVariableSchema = z.object({
  type: z.enum(["string", "number", "boolean"]),
  /** Where the variable value comes from */
  source: z.enum(["context", "config", "input"]),
  /** Human-readable label shown in the auto-generated context block */
  name: z.string().optional(),
  description: z.string().optional(),
});

// ─── Runtime Constraints ───

export const AgentConstraintsSchema = z.object({
  maxSteps: z.int().positive().default(10),
  maxConcurrentToolCalls: z.int().positive().default(3),
  timeoutMs: z.int().positive().default(120_000),
  /**
   * Maximum number of correction attempts when the LLM returns plain text
   * without calling the finish tool. Each correction re-prompts the LLM to
   * use the explicit termination tool. Does NOT consume a regular step.
   */
  maxCorrectionAttempts: z.int().min(0).default(2),
});

// ─── Pipeline Orchestration ───

export const PipelineStageSchema = z.object({
  agentId: z.string(),
  inputFrom: z.union([z.string(), z.array(z.string())]).optional(),
  outputKey: z.string(),
});

export const OrchestrationSchema = z.object({
  mode: z.enum(["pipeline"]),
  stages: z.array(PipelineStageSchema).min(1),
});

// ─── Agent Definition ───

export const AgentDefinitionSchema = z.object({
  /** Unique string identifier for the agent */
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  version: z.string().default("1.0.0"),
  /** Lucide icon name */
  icon: z.string().optional(),

  /** LLM configuration */
  llm: AgentLLMConfigSchema,

  /** System prompt template (supports {{variable}} interpolation) */
  systemPrompt: z.string(),
  /** Variable definitions for system prompt interpolation */
  systemPromptVariables: z
    .record(z.string(), SystemPromptVariableSchema)
    .optional(),

  /** List of tool names this agent is allowed to use */
  tools: z.array(z.string()).default([]),

  /** Runtime constraints */
  constraints: AgentConstraintsSchema.optional(),

  /** Multi-agent orchestration (only present on orchestrator agents) */
  orchestration: OrchestrationSchema.nullable().optional(),
});

// ─── Inferred Types ───

export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;
export type AgentLLMConfig = z.infer<typeof AgentLLMConfigSchema>;
export type SystemPromptVariable = z.infer<typeof SystemPromptVariableSchema>;
export type AgentConstraints = z.infer<typeof AgentConstraintsSchema>;
export type PipelineStage = z.infer<typeof PipelineStageSchema>;
export type Orchestration = z.infer<typeof OrchestrationSchema>;
