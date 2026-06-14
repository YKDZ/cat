import type { ChatMessage } from "@cat/plugin-core";

// ─── Token Estimator ──────────────────────────────────────────────────────────

/**
 * Lightweight token estimation: approximates by dividing character count by 4.
 */
export const estimateTokens = (msg: ChatMessage): number => {
  const text =
    typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
  return Math.ceil(text.length / 4);
};
