import type { AgentToolCallItem } from "@/app/stores/agent";

/** Graph 节点执行状态 */
export interface NodeExecution {
  nodeId: string;
  nodeType:
    | "llm"
    | "tool"
    | "router"
    | "human_input"
    | "parallel"
    | "join"
    | "transform"
    | "loop"
    | "subgraph";
  status: "pending" | "running" | "paused" | "completed" | "error";
  startedAt: Date | null;
  completedAt: Date | null;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  streamingText?: string;
  thinkingText?: string;
  toolCalls?: AgentToolCallItem[];
}

export type GraphEventType =
  | "run:start"
  | "run:pause"
  | "run:resume"
  | "run:cancel"
  | "run:end"
  | "run:error"
  | "node:start"
  | "node:end"
  | "node:error"
  | "node:retry"
  | "llm:token"
  | "llm:complete"
  | "llm:error"
  | "tool:call"
  | "tool:result"
  | "tool:error"
  | "tool:confirm:required"
  | "tool:confirm:response"
  | "human:input:required"
  | "human:input:received"
  | "checkpoint:saved";

export interface GraphEvent {
  eventId: string;
  runId: string;
  nodeId?: string;
  parentEventId?: string;
  type: GraphEventType;
  timestamp: string;
  payload: Record<string, unknown>;
}
