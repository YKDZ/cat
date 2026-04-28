export type AgentEventType = "stdout" | "stderr" | "exit" | "error";

export interface AgentEvent {
  type: AgentEventType;
  data?: string;
  exitCode?: number;
}

export interface AgentContext {
  systemPrompt: string;
  issueContext: string;
  agentDefinition: string;
  model: string | null;
  effort: string | null;
  /** Main workspace root (used for state/logs and agent definition lookup). */
  workspaceRoot: string;
  /** Working directory for the agent process. Defaults to workspaceRoot when not set. */
  agentWorkdir?: string;
}

export interface AgentInvoker {
  invoke(context: AgentContext): AsyncIterable<AgentEvent>;
}
