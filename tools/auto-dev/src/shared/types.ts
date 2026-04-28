// ── Agent-related types ───────────────────────────────────────────────

export type AgentProvider = "claude-code" | "copilot";

export type AgentModel = "opus" | "sonnet" | "haiku";

export type AgentEffort = "high" | "medium" | "low";

// ── Workflow types ────────────────────────────────────────────────────

export type WorkflowPhase =
  | "brainstorm"
  | "iplan"
  | "impl"
  | "review"
  | "fix"
  | "doc-sync"
  | "status";

export type WorkflowStatus =
  | "pending"
  | "running"
  | "waiting_decision"
  | "waiting_human"
  | "blocked"
  | "completed"
  | "failed"
  | "desynced";

export interface WorkflowRun {
  id: string;
  issueNumber: number;
  repoFullName: string;
  currentPhase: WorkflowPhase | null;
  status: WorkflowStatus;
  branch: string;
  agentProvider: AgentProvider | null;
  agentModel: AgentModel | null;
  agentEffort: AgentEffort | null;
  agentDefinition: string | null;
  runId: string | null;
  namespace: string | null;
  startedAt: string;
  updatedAt: string;
  decisionCount: number;
  pendingDecisionIds: string[];
}

// ── Decision types ────────────────────────────────────────────────────

export interface DecisionOption {
  key: string;
  label: string;
  description: string;
}

export type DecisionStatus = "pending" | "resolved";

export type ResolutionChannel = "cli" | "issue_comment";

export interface DecisionBlock {
  id: string;
  workflowRunId: string;
  title: string;
  options: DecisionOption[];
  recommendation: string;
  context: string | null;
  status: DecisionStatus;
  resolution: string | null;
  resolvedBy: string | null;
  resolutionChannel: ResolutionChannel | null;
  requestedAt: string;
  resolvedAt: string | null;
  socketConnectionId: string | null;
}

export interface DecisionResponse {
  decisionId: string;
  title: string;
  resolution: string;
  resolvedBy: string;
  resolvedAt: string;
  remainingDecisions: number;
}

export interface DecisionRequest {
  id: string;
  workflowRunId: string;
  title: string;
  options: DecisionOption[];
  recommendation: string;
  context: string | null;
}

// ── Audit types ───────────────────────────────────────────────────────

export type AuditEventType =
  | "decision_requested"
  | "decision_blocked"
  | "decision_resolved"
  | "decision_unblocked"
  | "phase_transition"
  | "summary_published"
  | "agent_definition_selected"
  | "workflow_started"
  | "workflow_completed"
  | "workflow_failed"
  | "validation_requested"
  | "validation_passed"
  | "validation_failed"
  | "pr_created"
  | "pr_merged";

export interface AuditEvent {
  id: string;
  workflowRunId: string;
  timestamp: string;
  type: AuditEventType;
  payload: Record<string, unknown>;
}

// ── Notification types ────────────────────────────────────────────────

export type NotificationType =
  | "waiting_decision"
  | "phase_transition"
  | "agent_summary"
  | "waiting_human"
  | "validation_failed"
  | "workflow_completed"
  | "workflow_failed"
  | "pr_ready";

export interface NotificationEvent {
  id: string;
  workflowRunId: string;
  type: NotificationType;
  message: string;
  channel: string;
  sentAt: string;
}

// ── Sync types ────────────────────────────────────────────────────────

export interface IssueSyncMapping {
  issueNumber: number;
  namespace: string;
  syncedFiles: Array<{ path: string; lastSyncAt: string }>;
  lastSyncAt: string;
}

// ── Coordinator types ─────────────────────────────────────────────────

export interface CoordinatorState {
  startedAt: string;
  pollIntervalSec: number;
  activeRunIds: string[];
}

// ── Agent definition types ────────────────────────────────────────────

export interface AgentRegistration {
  definition: string;
  description: string;
  defaultModel: AgentModel;
}

export interface IssueLabelConfig {
  agentProvider: AgentProvider | null;
  agentModel: AgentModel | null;
  agentEffort: AgentEffort | null;
  workflowAgent: string | null;
  autoMerge: boolean;
}
