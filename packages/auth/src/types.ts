import type { EdgeCondition } from "@cat/graph";

import * as z from "zod/v4";

// ====== Auth 节点类型 ======

export const AuthNodeTypeSchema = z.enum([
  "credential_collector",
  "challenge_verifier",
  "decision_router",
  "identity_resolver",
  "session_finalizer",
  "plugin_custom",
]);
export type AuthNodeType = z.infer<typeof AuthNodeTypeSchema>;

// ====== 客户端组件类型 ======

export const ClientComponentTypeSchema = z.enum([
  "identifier_input",
  "password_input",
  "otp_input",
  "totp_input",
  "webauthn_prompt",
  "qrcode_display",
  "json_form",
  "none",
]);
export type ClientComponentType = z.infer<typeof ClientComponentTypeSchema>;

// ====== AAL (Authentication Assurance Level) ======

export const AALSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export type AAL = z.infer<typeof AALSchema>;

// ====== ClientNodeHint ======

export const ClientNodeHintSchema = z.object({
  componentType: ClientComponentTypeSchema,
  formSchema: z.record(z.string(), z.unknown()).optional(),
  displayInfo: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      icon: z.string().optional(),
    })
    .optional(),
  passToClient: z.record(z.string(), z.unknown()).optional(),
});
export type ClientNodeHint = z.infer<typeof ClientNodeHintSchema>;

// ====== AuthNodeDefinition ======

export const AuthNodeDefinitionSchema = z.object({
  id: z.string().min(1),
  type: AuthNodeTypeSchema,
  factorId: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  retry: z.object({ maxAttempts: z.int().min(1) }).optional(),
  timeoutSeconds: z.int().optional(),
  clientHint: ClientNodeHintSchema,
});
export type AuthNodeDefinition = z.infer<typeof AuthNodeDefinitionSchema>;

// ====== AuthEdge — 使用 @cat/graph 的 EdgeCondition ======

export interface AuthEdge {
  from: string;
  to: string;
  condition?: EdgeCondition;
  label?: string;
}

// ====== AuthFlowDefinition ======

export interface AuthFlowDefinition {
  id: string;
  version: string;
  description?: string;
  nodes: Record<string, AuthNodeDefinition>;
  edges: AuthEdge[];
  entry: string;
  terminalNodes: { success: string[]; failure: string[] };
  config?: { maxSteps: number; flowTTLSeconds: number; requireCSRF: boolean };
}

// ====== CompletedFactor ======

export interface CompletedFactor {
  factorType: string;
  factorId: string;
  completedAt: string;
  aal: number;
}

// ====== AuthBlackboardData ======

export const AuthBlackboardDataSchema = z.object({
  flowDefId: z.string(),
  currentNode: z.string(),
  completedNodes: z.array(z.string()),
  status: z.enum(["pending", "in_progress", "completed", "failed", "expired"]),
  identity: z.object({
    userId: z.string().optional(),
    email: z.string().optional(),
    name: z.string().optional(),
    identifier: z.string().optional(),
    authProviderId: z.int().optional(),
    providerIssuer: z.string().optional(),
    providedAccountId: z.string().optional(),
  }),
  aal: AALSchema,
  completedFactors: z.array(
    z.object({
      factorType: z.string(),
      factorId: z.string(),
      completedAt: z.string(),
      aal: z.number(),
    }),
  ),
  nodeOutputs: z.record(z.string(), z.unknown()),
  pluginData: z.record(z.string(), z.unknown()),
});
export type AuthBlackboardData = z.infer<typeof AuthBlackboardDataSchema>;

// ====== FlowState (客户端可见) ======

export interface FlowState {
  flowId: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "expired";
  currentNode: { nodeId: string; hint: ClientNodeHint } | null;
  progress: { completedSteps: number; totalEstimatedSteps: number };
  error?: { code: string; message: string; retriesRemaining?: number };
}

// ====== 节点执行器上下文 ======

export interface AuthNodeExecutorContext {
  flowId: string;
  nodeId: string;
  blackboard: AuthBlackboardData;
  input?: Record<string, unknown>;
  httpContext: {
    ip: string;
    userAgent: string;
    csrfToken: string;
    cookies: Record<string, string>;
  };
  services: {
    sessionStore: unknown;
    cacheStore: unknown;
    db: unknown;
    pluginManager: unknown;
  };
}

export interface AuthNodeExecutionResult {
  updates: Record<string, unknown>;
  clientHint?: ClientNodeHint;
  status: "advance" | "wait_input" | "completed" | "failed";
  error?: { code: string; message: string };
}

export type AuthNodeExecutor = (
  ctx: AuthNodeExecutorContext,
  nodeDef: AuthNodeDefinition,
) => Promise<AuthNodeExecutionResult>;
