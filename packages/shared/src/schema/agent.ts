import { stringify as stringifyYaml } from "yaml";
import * as z from "zod";

import { AgentDefinitionTypeSchema } from "./enum";

// ─── LLM Configuration ───

/**
 * Agent LLM configuration schema.
 */
export const AgentLLMConfigSchema = z.object({
  /** Optional fallback PluginService DB ID referencing an LLM_PROVIDER instance */
  providerId: z.int().nullable().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.int().positive().optional(),
});

// ─── Prompt Configuration ───

/**
 * Agent prompt configuration schema.
 */
export const AgentPromptConfigSchema = z.object({
  /** Slot indices to auto-inject into the system prompt */
  autoInjectSlots: z.array(z.number()).default([]),
});

// ─── Security Policy ───

/**
 * Agent security policy schema (Phase 0a minimal version).
 */
export const AgentSecurityPolicySchema = z.object({
  allowExternalNetwork: z.boolean().default(false),
});

// ─── Scope ───

/**
 * Agent scope schema.
 */
export const AgentScopeSchema = z.object({
  type: z.enum(["GLOBAL", "PROJECT"]).default("GLOBAL"),
});

// ─── Session Metadata ───

/**
 * Agent session metadata schema.
 */
export const AgentSessionMetadataSchema = z.strictObject({
  projectId: z.uuidv4().optional(),
  projectName: z.string().optional(),
  providerId: z.int().optional(),
  branchId: z.int().positive().optional(),
  contentNodeIds: z.array(z.uuidv4()).optional(),
  currentElementContentNodeId: z.uuidv4().optional(),
  elementId: z.int().optional(),
  languageId: z.string().optional(),
  sourceLanguageId: z.string().optional(),
  issueId: z.int().optional(),
  pullRequestId: z.int().optional(),
});

// ─── Runtime Constraints ───

/**
 * Agent runtime constraints schema.
 */
export const AgentConstraintsSchema = z.object({
  maxSteps: z.int().positive().default(50),
  maxConcurrentToolCalls: z.int().positive().default(3),
  timeoutMs: z.int().positive().default(600_000),
  /**
   * Maximum number of correction attempts when the LLM returns plain text
   * without calling the finish tool.
   */
  maxCorrectionAttempts: z.int().min(0).default(2),
  /** Error recovery budgets (independent per error type). */
  errorRecovery: z
    .object({
      truncationMax: z.int().min(0).default(3),
      contextOverflowMax: z.int().min(0).default(2),
    })
    .optional(),
});

// ─── Pipeline Orchestration ───

/**
 * Orchestration pipeline stage schema.
 */
export const PipelineStageSchema = z.object({
  agentId: z.string(),
  inputFrom: z.union([z.string(), z.array(z.string())]).optional(),
  outputKey: z.string(),
});

/**
 * Multi-agent orchestration configuration schema.
 */
export const OrchestrationSchema = z.object({
  mode: z.enum(["pipeline"]),
  stages: z.array(PipelineStageSchema).min(1),
});

// ─── Agent Definition Metadata Schema (frontmatter only) ───

/**
 * Zod schema for agent definition frontmatter (metadata only, excludes body).
 */
export const AgentDefinitionMetadataSchema = z.object({
  /** Unique human-readable slug identifier for the agent (e.g. "translator-zh-en") */
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().default("1.0.0"),
  /** Lucide icon name */
  icon: z.string().optional(),
  /** Agent usage type/category */
  type: AgentDefinitionTypeSchema.default("GENERAL"),
  /** LLM configuration — optional; providerId is only used as a fallback when the session does not specify one */
  llm: AgentLLMConfigSchema.optional(),
  /** List of tool names this agent is allowed to use */
  tools: z.array(z.string()).default([]),
  /** Prompt auto-injection configuration */
  promptConfig: AgentPromptConfigSchema.optional(),
  /** Runtime constraints */
  constraints: AgentConstraintsSchema.optional(),
  /** Security policy */
  securityPolicy: AgentSecurityPolicySchema.optional(),
  /** Agent scope (GLOBAL or PROJECT) */
  scope: AgentScopeSchema.optional(),
  /** Multi-agent orchestration (only present on orchestrator agents) */
  orchestration: OrchestrationSchema.nullable().optional(),
});

// ─── Parsed Agent Definition (metadata + body) ───

/**
 * Full agent definition parsed from MD (metadata + body content).
 */
export interface ParsedAgentDefinition {
  /**
   * Metadata parsed from frontmatter.
   */
  metadata: AgentDefinitionMetadata;
  /**
   * MD body content (systemPrompt template, supports {{variable}} interpolation).
   */
  content: string;
}

// ─── Serialize Helper ───

/**
 * Serialize agent metadata and body content into a complete MD text.
 *
 * @param parsed - Parsed agent definition
 * @returns - Full MD string with YAML frontmatter and body
 */
export const serializeAgentDefinition = (
  parsed: ParsedAgentDefinition,
): string => {
  const frontmatter = stringifyYaml(parsed.metadata, { lineWidth: 0 });
  return `---\n${frontmatter}---\n\n${parsed.content}`;
};

// ─── Inferred Types ───

/**
 * Agent definition metadata type.
 */
export type AgentDefinitionMetadata = z.infer<
  typeof AgentDefinitionMetadataSchema
>;

/**
 * Agent LLM configuration type.
 */
export type AgentLLMConfig = z.infer<typeof AgentLLMConfigSchema>;

/**
 * Agent runtime constraints type.
 */
export type AgentConstraints = z.infer<typeof AgentConstraintsSchema>;

/**
 * Agent prompt configuration type.
 */
export type AgentPromptConfig = z.infer<typeof AgentPromptConfigSchema>;

/**
 * Agent security policy type.
 */
export type AgentSecurityPolicy = z.infer<typeof AgentSecurityPolicySchema>;

/**
 * Agent scope type.
 */
export type AgentScope = z.infer<typeof AgentScopeSchema>;

/**
 * Agent session metadata type.
 */
export type AgentSessionMetadata = z.infer<typeof AgentSessionMetadataSchema>;

/**
 * Multi-agent orchestration configuration type.
 */
export type Orchestration = z.infer<typeof OrchestrationSchema>;

/**
 * Orchestration pipeline stage type.
 */
export type PipelineStage = z.infer<typeof PipelineStageSchema>;

// ─── Deprecated: Old AgentDefinitionSchema ───

/** @deprecated Use AgentDefinitionMetadataSchema + content column instead. */
export const AgentDefinitionSchema = AgentDefinitionMetadataSchema;
/** @deprecated Use AgentDefinitionMetadata instead. */
export type AgentDefinition = AgentDefinitionMetadata;
/** @deprecated Use ParsedAgentDefinition instead. */
export type SystemPromptVariable = {
  type: "string" | "number" | "boolean";
  source: "context" | "config" | "input";
  name?: string;
  description?: string;
};

// ─── Tool Confirmation Request ───

/** Sent from backend → frontend when a tool requires user confirmation */
export const ToolConfirmRequestSchema = z.object({
  callId: z.string(),
  toolName: z.string(),
  description: z.string(),
  arguments: z.record(z.string(), z.unknown()),
  riskLevel: z.enum(["low", "medium", "high"]),
});
export type ToolConfirmRequest = z.infer<typeof ToolConfirmRequestSchema>;

/** User's response to a tool confirmation request */
export const ToolConfirmResponseSchema = z.object({
  callId: z.string(),
  decision: z.enum([
    "allow_once",
    "trust_tool_for_session",
    "trust_all_for_session",
    "deny",
  ]),
});
export type ToolConfirmResponse = z.infer<typeof ToolConfirmResponseSchema>;

// ─── Tool Execute Request ───

/** Sent from backend → frontend when a client tool needs execution */
export const ToolExecuteRequestSchema = z.object({
  callId: z.string(),
  toolName: z.string(),
  arguments: z.record(z.string(), z.unknown()),
});
export type ToolExecuteRequest = z.infer<typeof ToolExecuteRequestSchema>;

/** Frontend's response after executing a client tool */
export const ToolExecuteResponseSchema = z.object({
  callId: z.string(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});
export type ToolExecuteResponse = z.infer<typeof ToolExecuteResponseSchema>;

// ─── Risk Level Mapping ───

export const ConfirmationPolicyValues = [
  "auto_allow",
  "session_trust",
  "always_confirm",
] as const;
export const ConfirmationPolicySchema = z.enum(ConfirmationPolicyValues);
export type ConfirmationPolicy = z.infer<typeof ConfirmationPolicySchema>;
