import type { DrizzleClient } from "@cat/db";

import {
  executeQuery,
  getAgentDefinitionByInternalId,
  getAgentSessionByExternalId,
} from "@cat/domain";
import {
  AgentDefinitionSchema,
  type AgentDefinition,
} from "@cat/shared/schema/agent";

// ─── Types ───

export interface ResolvedSession {
  /** DB internal ID */
  id: number;
  /** Public UUID */
  externalId: string;
  agentDefinitionId: number;
  status: string;
  userId: string | null;
  metadata: unknown;
}

// ─── Resolve Session ───

/**
 * Load and validate an agent session from the DB.
 *
 * @param userId - When provided, an additional `userId` WHERE condition is
 *   applied (used by the HTTP endpoint for ownership checks). Workers that
 *   have already been authorised at enqueue time can omit this.
 *
 * @throws if the session is not found or not `ACTIVE`.
 */
export const resolveSession = async (
  drizzle: DrizzleClient,
  sessionExternalId: string,
  userId?: string,
): Promise<ResolvedSession> => {
  const session = await executeQuery(
    { db: drizzle },
    getAgentSessionByExternalId,
    {
      externalId: sessionExternalId,
      userId,
    },
  );

  if (session === null) {
    throw new Error(`Session not found: ${sessionExternalId}`);
  }

  if (session.status !== "ACTIVE") {
    throw new Error(
      `Session ${sessionExternalId} is ${session.status}, cannot accept new messages`,
    );
  }

  return session;
};

// ─── Resolve Definition ───

/**
 * Load and parse the agent definition for the given DB-internal definition ID.
 */
export const resolveDefinition = async (
  drizzle: DrizzleClient,
  agentDefinitionId: number,
): Promise<AgentDefinition> => {
  const definition = await executeQuery(
    { db: drizzle },
    getAgentDefinitionByInternalId,
    { id: agentDefinitionId },
  );

  if (definition === null) {
    throw new Error(
      `Agent definition not found for id ${String(agentDefinitionId)}`,
    );
  }

  return AgentDefinitionSchema.parse(definition.definition);
};
