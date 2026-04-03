import { agentDefinition } from "@cat/db";
import { AgentDefinitionSchema } from "@cat/shared/schema/agent";
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
  definition: AgentDefinitionSchema,
  type: AgentDefinitionTypeSchema.optional(),
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
        definition: command.definition,
        type: command.type,
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
