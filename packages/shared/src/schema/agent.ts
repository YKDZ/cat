import * as z from "zod";

// ─── Tool Confirmation Request ───

/** Sent from backend → frontend when a tool requires user confirmation */
export const ToolConfirmRequestSchema = z.object({
  callId: z.string(),
  toolName: z.string(),
  description: z.string(),
  arguments: z.record(z.string(), z.unknown()),
  riskLevel: z.enum(["low", "medium", "high"]),
});
export type ToolConfirmRequest = z.infer<typeof ToolConfirmRequestSchema>;

/** User's response to a tool confirmation request */
export const ToolConfirmResponseSchema = z.object({
  callId: z.string(),
  decision: z.enum([
    "allow_once",
    "trust_tool_for_session",
    "trust_all_for_session",
    "deny",
  ]),
});
export type ToolConfirmResponse = z.infer<typeof ToolConfirmResponseSchema>;

// ─── Tool Execute Request ───

/** Sent from backend → frontend when a client tool needs execution */
export const ToolExecuteRequestSchema = z.object({
  callId: z.string(),
  toolName: z.string(),
  arguments: z.record(z.string(), z.unknown()),
});
export type ToolExecuteRequest = z.infer<typeof ToolExecuteRequestSchema>;

/** Frontend's response after executing a client tool */
export const ToolExecuteResponseSchema = z.object({
  callId: z.string(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});
export type ToolExecuteResponse = z.infer<typeof ToolExecuteResponseSchema>;

// ─── Risk Level Mapping ───

export const ConfirmationPolicyValues = [
  "auto_allow",
  "session_trust",
  "always_confirm",
] as const;
export const ConfirmationPolicySchema = z.enum(ConfirmationPolicyValues);
export type ConfirmationPolicy = z.infer<typeof ConfirmationPolicySchema>;
