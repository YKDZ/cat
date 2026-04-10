import type { NonNullJSONType } from "@cat/shared/schema/json";

import { agentRun, agentSession, eq } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const CreateAgentRunCommandSchema = z.object({
  /**
   * @zh 对应的 agentSession 外部 UUID
   * @en Corresponding agentSession external UUID
   */
  sessionId: z.uuidv4(),
  /**
   * @zh 图定义（GraphDefinition JSON）
   * @en Graph definition (GraphDefinition JSON)
   */
  graphDefinition: z.unknown(),
  /**
   * @zh 去重键（可选，用于幂等性保证）
   * @en Deduplication key (optional, for idempotency)
   */
  deduplicationKey: z.string().optional(),
});

export type CreateAgentRunCommand = z.infer<typeof CreateAgentRunCommandSchema>;

export type CreateAgentRunResult = {
  /** @zh 新创建的 agentRun 外部 UUID @en External UUID of the new agentRun */
  runId: string;
  /** @zh 新创建的 agentRun 内部 ID @en Internal ID of the new agentRun */
  runDbId: number;
};

/**
 * @zh 创建新的 AgentRun 并更新 AgentSession.currentRunId。
 * @en Create a new AgentRun and update AgentSession.currentRunId.
 */
export const createAgentRun: Command<
  CreateAgentRunCommand,
  CreateAgentRunResult
> = async (ctx, command) => {
  // Look up session internal ID
  const session = assertSingleNonNullish(
    await ctx.db
      .select({ id: agentSession.id })
      .from(agentSession)
      .where(eq(agentSession.externalId, command.sessionId))
      .limit(1),
  );

  // Create the run
  const run = assertSingleNonNullish(
    await ctx.db
      .insert(agentRun)
      .values({
        sessionId: session.id,
        status: "running",
        // oxlint-disable-next-line no-unsafe-type-assertion
        graphDefinition: command.graphDefinition as NonNullJSONType,
        deduplicationKey: command.deduplicationKey ?? null,
      })
      .returning({ id: agentRun.id, externalId: agentRun.externalId }),
  );

  // Update session's currentRunId
  await ctx.db
    .update(agentSession)
    .set({ currentRunId: run.id, updatedAt: new Date() })
    .where(eq(agentSession.id, session.id));

  return { result: { runId: run.externalId, runDbId: run.id }, events: [] };
};
