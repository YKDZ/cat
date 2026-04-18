import { agentDefinition, eq } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

export const DeleteAgentDefinitionCommandSchema = z.object({
  agentDefinitionId: z.int(),
});

export type DeleteAgentDefinitionCommand = z.infer<
  typeof DeleteAgentDefinitionCommandSchema
>;

export const deleteAgentDefinition: Command<
  DeleteAgentDefinitionCommand
> = async (ctx, command) => {
  await ctx.db
    .delete(agentDefinition)
    .where(eq(agentDefinition.id, command.agentDefinitionId));

  return {
    result: undefined,
    events: [],
  };
};
