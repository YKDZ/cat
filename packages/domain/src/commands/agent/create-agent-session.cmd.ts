import type { JSONType } from "@cat/shared";

import { agentDefinition, agentSession, eq } from "@cat/db";
import {
  AgentSessionMetadataSchema,
  type AgentSessionMetadata,
} from "@cat/shared";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

export const CreateAgentSessionCommandSchema = z.object({
  agentDefinitionId: z.uuidv4(),
  userId: z.uuidv4(),
  projectId: z.uuidv4().optional(),
  metadata: AgentSessionMetadataSchema.optional(),
});

export type CreateAgentSessionCommand = z.infer<
  typeof CreateAgentSessionCommandSchema
>;

export const createAgentSession: Command<
  CreateAgentSessionCommand,
  { sessionId: string }
> = async (ctx, command) => {
  const definition = assertSingleNonNullish(
    await ctx.db
      .select({ id: agentDefinition.id })
      .from(agentDefinition)
      .where(eq(agentDefinition.externalId, command.agentDefinitionId))
      .limit(1),
  );

  const session = assertSingleNonNullish(
    await ctx.db
      .insert(agentSession)
      .values({
        agentDefinitionId: definition.id,
        userId: command.userId,
        projectId: command.projectId,
        metadata: (command.metadata ??
          {}) satisfies AgentSessionMetadata as JSONType,
      })
      .returning({ externalId: agentSession.externalId }),
  );

  return {
    result: {
      sessionId: session.externalId,
    },
    events: [],
  };
};
