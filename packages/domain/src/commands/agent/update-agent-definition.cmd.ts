import { agentDefinition, eq } from "@cat/db";
import { AgentDefinitionSchema } from "@cat/shared/schema/agent";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const UpdateAgentDefinitionCommandSchema = z.object({
  id: z.uuidv4(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  definition: AgentDefinitionSchema.optional(),
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
      definition: command.definition,
    })
    .where(eq(agentDefinition.externalId, command.id));

  return {
    result: undefined,
    events: [],
  };
};
