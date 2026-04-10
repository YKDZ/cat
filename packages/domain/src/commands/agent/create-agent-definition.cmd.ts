import { agentDefinition } from "@cat/db";
import {
  AgentConstraintsSchema,
  AgentLLMConfigSchema,
  AgentPromptConfigSchema,
  AgentSecurityPolicySchema,
  OrchestrationSchema,
} from "@cat/shared/schema/agent";
import {
  AgentDefinitionTypeSchema,
  ScopeTypeSchema,
} from "@cat/shared/schema/enum";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const CreateAgentDefinitionCommandSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  scopeType: ScopeTypeSchema.default("GLOBAL"),
  scopeId: z.string().default(""),
  // Metadata fields (from frontmatter)
  definitionId: z.string().default(""),
  version: z.string().default("1.0.0"),
  icon: z.string().optional(),
  type: AgentDefinitionTypeSchema.default("GENERAL"),
  llmConfig: AgentLLMConfigSchema.optional(),
  tools: z.array(z.string()).default([]),
  promptConfig: AgentPromptConfigSchema.optional(),
  constraints: AgentConstraintsSchema.optional(),
  securityPolicy: AgentSecurityPolicySchema.optional(),
  orchestration: OrchestrationSchema.nullable().optional(),
  // MD body (system prompt)
  content: z.string().default(""),
  isBuiltin: z.boolean().default(false),
});

export type CreateAgentDefinitionCommand = z.infer<
  typeof CreateAgentDefinitionCommandSchema
>;

export const createAgentDefinition: Command<
  CreateAgentDefinitionCommand,
  { id: string }
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(agentDefinition)
      .values({
        name: command.name,
        description: command.description,
        scopeType: command.scopeType,
        scopeId: command.scopeId,
        definitionId: command.definitionId,
        version: command.version,
        icon: command.icon,
        type: command.type,
        llmConfig: command.llmConfig ?? null,
        tools: command.tools,
        promptConfig: command.promptConfig ?? null,
        constraints: command.constraints ?? null,
        securityPolicy: command.securityPolicy ?? null,
        orchestration: command.orchestration ?? null,
        content: command.content,
        isBuiltin: command.isBuiltin,
      })
      .returning({ externalId: agentDefinition.externalId }),
  );

  return {
    result: {
      id: inserted.externalId,
    },
    events: [],
  };
};
