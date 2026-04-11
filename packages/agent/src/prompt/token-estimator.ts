import type { ChatMessage } from "@cat/plugin-core";

// ─── Token Estimator ──────────────────────────────────────────────────────────

/**
 * @zh 轻量级 token 估算函数：用字符数/4 近似。
 * @en Lightweight token estimation: approximates by dividing character count by 4.
 */
export const estimateTokens = (msg: ChatMessage): number => {
  const text =
    typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
  return Math.ceil(text.length / 4);
};
