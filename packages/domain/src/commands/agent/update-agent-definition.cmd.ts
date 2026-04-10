import { agentDefinition, eq } from "@cat/db";
import {
  AgentConstraintsSchema,
  AgentLLMConfigSchema,
  AgentPromptConfigSchema,
  AgentSecurityPolicySchema,
  OrchestrationSchema,
} from "@cat/shared/schema/agent";
import { AgentDefinitionTypeSchema } from "@cat/shared/schema/enum";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const UpdateAgentDefinitionCommandSchema = z.object({
  id: z.uuidv4(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  // Metadata fields
  definitionId: z.string().optional(),
  version: z.string().optional(),
  icon: z.string().nullable().optional(),
  type: AgentDefinitionTypeSchema.optional(),
  llmConfig: AgentLLMConfigSchema.nullable().optional(),
  tools: z.array(z.string()).optional(),
  promptConfig: AgentPromptConfigSchema.nullable().optional(),
  constraints: AgentConstraintsSchema.nullable().optional(),
  securityPolicy: AgentSecurityPolicySchema.nullable().optional(),
  orchestration: OrchestrationSchema.nullable().optional(),
  // MD body
  content: z.string().optional(),
});

export type UpdateAgentDefinitionCommand = z.infer<
  typeof UpdateAgentDefinitionCommandSchema
>;

export const updateAgentDefinition: Command<
  UpdateAgentDefinitionCommand
> = async (ctx, command) => {
  await ctx.db
    .update(agentDefinition)
    .set({
      name: command.name,
      description: command.description,
      ...(command.definitionId !== undefined && {
        definitionId: command.definitionId,
      }),
      ...(command.version !== undefined && { version: command.version }),
      ...(command.icon !== undefined && { icon: command.icon }),
      ...(command.type !== undefined && { type: command.type }),
      ...(command.llmConfig !== undefined && { llmConfig: command.llmConfig }),
      ...(command.tools !== undefined && { tools: command.tools }),
      ...(command.promptConfig !== undefined && {
        promptConfig: command.promptConfig,
      }),
      ...(command.constraints !== undefined && {
        constraints: command.constraints,
      }),
      ...(command.securityPolicy !== undefined && {
        securityPolicy: command.securityPolicy,
      }),
      ...(command.orchestration !== undefined && {
        orchestration: command.orchestration,
      }),
      ...(command.content !== undefined && { content: command.content }),
    })
    .where(eq(agentDefinition.externalId, command.id));

  return {
    result: undefined,
    events: [],
  };
};
