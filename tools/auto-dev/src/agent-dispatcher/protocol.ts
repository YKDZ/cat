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
  workspaceRoot: string;
}

export interface AgentInvoker {
  invoke(context: AgentContext): AsyncIterable<AgentEvent>;
}
