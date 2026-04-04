import { ORPCError } from "@orpc/client";
import * as z from "zod/v4";

import { authed, checkElementPermission } from "@/orpc/server";

// ─── Ghost Text Suggest ───

/**
 * Stream ghost text continuation suggestions for the current editor input.
 *
 * TODO: Ghost text 依赖已移除的 buildSystemPrompt/runFim，需在 Agent 重构后重新实现。
 */
export const suggest = authed
  .input(
    z.object({
      /** DB ID of the element being translated */
      elementId: z.int(),
      /** BCP-47 language tag of the target language */
      languageId: z.string(),
      /** Text the translator has already typed */
      currentInput: z.string(),
      /** Cursor position within currentInput */
      cursorPosition: z.int(),
      /** Translation memory hints (pre-fetched by the frontend, optional) */
      memoryHints: z.string().optional(),
      /** Glossary term hints (pre-fetched by the frontend, optional) */
      termHints: z.string().optional(),
      /** Serialised neighbouring translated segments (optional) */
      neighborElements: z.string().optional(),
    }),
  )
  .use(checkElementPermission("viewer"), (i) => i.elementId)
  // oxlint-disable-next-line require-yield -- stub handler always throws
  .handler(async function* (): AsyncGenerator<{ text: string }> {
    throw new ORPCError("NOT_IMPLEMENTED", {
      message: "TODO: Ghost text 依赖已移除的模块，需在 Agent 重构后重新实现",
    });
  });
