import * as z from "zod/v4";

import { defineTool } from "@/tools/types";

/**
 * The canonical name of the built-in finish tool.
 * Used by the frontend to filter this tool out of the UI timeline.
 * The engine detects finish tools via the `isFinishTool` flag, not this name.
 */
export const FINISH_TOOL_NAME = "finish_task" as const;

/**
 * A built-in control tool that the agent MUST call when the task is complete.
 *
 * This is a **pure termination signal** — the agent should write its final
 * response as normal text (streamed via `text_delta`) and then call this
 * tool to signal that the turn is over. The optional `message` parameter
 * exists only as a fallback; the engine always prefers the streamed
 * `response.content` so the user sees the reply token-by-token.
 */
export const finishTaskTool = defineTool({
  name: FINISH_TOOL_NAME,
  description:
    "Call this tool AFTER you have written your final response to signal " +
    "that the task is complete. Write your answer as normal text first, " +
    "then invoke this tool with no arguments (or an optional short summary). " +
    "Once called, the agent session will end immediately.",
  parameters: z.object({
    message: z
      .string()
      .optional()
      .describe(
        "Optional short summary. The engine prefers the streamed text " +
          "you already wrote; only provide this as a fallback.",
      ),
  }),
  execute: async ({ message }) => ({ message: message ?? null }),
  /** Marks this tool as the termination signal for the agent loop. */
  isFinishTool: true,
});
