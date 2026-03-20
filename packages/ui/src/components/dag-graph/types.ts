export type DagNodeType =
  | "llm"
  | "tool"
  | "router"
  | "parallel"
  | "join"
  | "human_input"
  | "transform"
  | "loop"
  | "subgraph";

export type DagNodeStatus =
  | "pending"
  | "running"
  | "completed"
  | "error"
  | "paused";

export interface DagGraphData {
  nodes: DagNodeData[];
  edges: DagEdgeData[];
}

export interface DagNodeData {
  id: string;
  label: string;
  type: DagNodeType;
  status?: DagNodeStatus;
  isEntry?: boolean;
  isExit?: boolean;
  metadata?: Record<string, unknown>;
}

export interface DagEdgeData {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: string;
  animated?: boolean;
}

export type DagDirection = "DOWN" | "RIGHT";
