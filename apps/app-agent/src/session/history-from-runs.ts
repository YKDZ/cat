import type { DrizzleClient } from "@cat/db";
import type { ChatMessage } from "@cat/plugin-core";

import { executeQuery, getLatestCompletedRunBlackboard } from "@cat/domain";

/**
 * Rebuild the conversation history (ChatMessage[]) for a session by reading
 * the Blackboard snapshot from the last completed AgentRun.
 *
 * Strategy: Blackboard Snapshot method
 * - Each completed Graph Run leaves a `messages` array in its Blackboard snapshot.
 * - We read only the most recent completed run's snapshot to get the full history.
 * - Falls back to a system-prompt-only array if no completed runs exist yet.
 */
export const rebuildConversationFromRuns = async (
  drizzle: DrizzleClient,
  sessionInternalId: number,
  systemPrompt: string,
): Promise<ChatMessage[]> => {
  const lastRun = await executeQuery(
    { db: drizzle },
    getLatestCompletedRunBlackboard,
    { sessionId: sessionInternalId },
  );

  if (!lastRun?.blackboardSnapshot) {
    return [{ role: "system", content: systemPrompt }];
  }

  const snapshot = lastRun.blackboardSnapshot;
  if (
    typeof snapshot !== "object" ||
    snapshot === null ||
    Array.isArray(snapshot)
  ) {
    return [{ role: "system", content: systemPrompt }];
  }

  const messages = Reflect.get(snapshot, "messages");
  if (!Array.isArray(messages)) {
    return [{ role: "system", content: systemPrompt }];
  }

  // oxlint-disable-next-line no-unsafe-type-assertion
  return messages as ChatMessage[];
};
