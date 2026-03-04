import {
  agentDefinition,
  agentSession,
  and,
  eq,
  type DrizzleClient,
} from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";

import {
  AgentDefinitionSchema,
  type AgentDefinition,
} from "@/schema/agent-definition";

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
  const conditions = [eq(agentSession.externalId, sessionExternalId)];
  if (userId) {
    conditions.push(eq(agentSession.userId, userId));
  }

  const session = assertSingleNonNullish(
    await drizzle
      .select({
        id: agentSession.id,
        externalId: agentSession.externalId,
        agentDefinitionId: agentSession.agentDefinitionId,
        status: agentSession.status,
        userId: agentSession.userId,
        metadata: agentSession.metadata,
      })
      .from(agentSession)
      .where(and(...conditions))
      .limit(1),
    `Session not found: ${sessionExternalId}`,
  );

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
  const defRow = assertSingleNonNullish(
    await drizzle
      .select({ definition: agentDefinition.definition })
      .from(agentDefinition)
      .where(eq(agentDefinition.id, agentDefinitionId))
      .limit(1),
    `Agent definition not found for id ${String(agentDefinitionId)}`,
  );

  return AgentDefinitionSchema.parse(defRow.definition);
};
