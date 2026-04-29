import { z } from "zod/v4";

// ── Domain entity schemas (for safe JSON deserialization) ─────────────

const FrontmatterConfigSchema = z.object({
  model: z.string().nullable(),
  effort: z.enum(["xhigh", "high", "medium", "low", "max"]).nullable(),
  agent: z.string().nullable(),
  maxDecisions: z.number().nullable(),
  maxTurns: z.number().nullable(),
  permissionMode: z.string().nullable(),
});

export const WorkflowRunSchema = z.object({
  id: z.string(),
  issueNumber: z.number(),
  repoFullName: z.string(),
  currentPhase: z
    .enum([
      "brainstorm",
      "iplan",
      "impl",
      "review",
      "fix",
      "doc-sync",
      "status",
    ])
    .nullable(),
  status: z.enum([
    "pending",
    "running",
    "waiting_decision",
    "waiting_human",
    "blocked",
    "completed",
    "failed",
    "desynced",
  ]),
  branch: z.string(),
  agentProvider: z.enum(["claude-code", "copilot"]).nullable(),
  agentModel: z.string().nullable(),
  agentEffort: z.enum(["xhigh", "high", "medium", "low", "max"]).nullable(),
  agentDefinition: z.string().nullable(),
  runId: z.string().nullable(),
  namespace: z.string().nullable(),
  startedAt: z.string(),
  updatedAt: z.string(),
  decisionCount: z.number(),
  pendingDecisionIds: z.array(z.string()),
  // Fields added in R7 may be absent in older state files
  prNumber: z
    .number()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  frontmatterConfig: FrontmatterConfigSchema.nullable()
    .optional()
    .transform((v) => v ?? null),
});

const DecisionOptionSchema2 = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
});

export const DecisionBlockSchema = z.object({
  id: z.string(),
  workflowRunId: z.string(),
  title: z.string(),
  options: z.array(DecisionOptionSchema2),
  recommendation: z.string(),
  context: z.string().nullable(),
  alias: z.string(),
  status: z.enum(["pending", "resolved"]),
  resolution: z.string().nullable(),
  resolvedBy: z.string().nullable(),
  resolutionChannel: z.enum(["cli", "issue_comment", "pr_comment"]).nullable(),
  requestedAt: z.string(),
  resolvedAt: z.string().nullable(),
  // Added in R7 — may be absent in older files
  batchId: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  socketConnectionId: z.string().nullable(),
});

export const CoordinatorStateSchema = z.object({
  startedAt: z.string(),
  pollIntervalSec: z.number(),
  activeRunIds: z.array(z.string()),
});

export const IssueSyncMappingSchema = z.object({
  issueNumber: z.number(),
  namespace: z.string(),
  syncedFiles: z.array(z.object({ path: z.string(), lastSyncAt: z.string() })),
  lastSyncAt: z.string(),
});

export const AuditEventSchema = z.object({
  id: z.string(),
  workflowRunId: z.string(),
  timestamp: z.string(),
  type: z.enum([
    "decision_requested",
    "decision_blocked",
    "decision_resolved",
    "decision_unblocked",
    "phase_transition",
    "summary_published",
    "agent_definition_selected",
    "workflow_started",
    "workflow_completed",
    "workflow_failed",
    "validation_requested",
    "validation_passed",
    "validation_failed",
    "pr_created",
    "pr_merged",
  ]),
  payload: z.record(z.string(), z.unknown()),
});

// ── Inferred types ─────────────────────────────────────────────────────

export type WorkflowRunParsed = z.infer<typeof WorkflowRunSchema>;
export type DecisionBlockParsed = z.infer<typeof DecisionBlockSchema>;

// ── GitHub CLI response schemas ───────────────────────────────────────

export const GhIssueLabelSchema = z.object({
  name: z.string(),
});

export const GhIssueSchema = z.object({
  number: z.number(),
  title: z.string(),
  labels: z.array(GhIssueLabelSchema),
  body: z.string(),
});

export type GhIssue = z.infer<typeof GhIssueSchema>;

export const GhPRSchema = z.object({
  number: z.number(),
  title: z.string(),
  headRefName: z.string(),
});

export type GhPR = z.infer<typeof GhPRSchema>;

export const GhCommentSchema = z.object({
  id: z.coerce.string(),
  body: z.string(),
  // REST API returns `user`, gh issue comment list --json returns `author`
  user: z.object({ login: z.string() }).optional(),
  author: z.object({ login: z.string() }).optional(),
});

export type GhComment = z.infer<typeof GhCommentSchema>;

// ── Decision schemas ──────────────────────────────────────────────────

export const DecisionOptionSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
});

export const DecisionRequestSchema = z.object({
  id: z.string(),
  workflowRunId: z.string(),
  title: z.string(),
  options: z.array(DecisionOptionSchema),
  recommendation: z.string(),
  context: z.string().nullable(),
});
