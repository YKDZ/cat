import type { JSONType } from "@cat/shared/schema/json";

import { agentDefinition, agentSession, eq } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

const AgentSessionMetadataSchema = z.object({
  projectId: z.string().optional(),
  documentId: z.string().optional(),
  elementId: z.int().optional(),
  languageId: z.string().optional(),
  sourceLanguageId: z.string().optional(),
});

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
        // oxlint-disable-next-line no-unsafe-type-assertion -- metadata shape is validated by Zod
        metadata: (command.metadata ?? {}) as JSONType,
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
