import type { Checkpointer } from "@/graph/checkpointer";
import type { EventBus } from "@/graph/event-bus";
import type {
  NodeDefinition,
  NodeExecutionContext,
  NodeExecutionResult,
  NodeType,
  RetryConfig,
} from "@/graph/types";

export type NodeExecutorContext = NodeExecutionContext & {
  eventBus: EventBus;
  checkpointer: Checkpointer;
};

export type NodeExecutor = (
  ctx: NodeExecutorContext,
  config: Record<string, unknown>,
) => Promise<NodeExecutionResult>;

export type ExecutorTaskInput = {
  runId: string;
  nodeId: string;
  nodeDef: NodeDefinition;
  snapshot: NodeExecutionContext["snapshot"];
  eventBus: EventBus;
  checkpointer: Checkpointer;
  signal?: AbortSignal;
  idempotencyKey?: string;
  retry?: RetryConfig;
};

export class NodeRegistry {
  private executors = new Map<NodeType, NodeExecutor>();

  register = (nodeType: NodeType, executor: NodeExecutor): void => {
    if (this.executors.has(nodeType)) {
      throw new Error(`Node executor already registered: ${nodeType}`);
    }
    this.executors.set(nodeType, executor);
  };

  getExecutor = (nodeType: NodeType): NodeExecutor => {
    const executor = this.executors.get(nodeType);
    if (!executor) {
      throw new Error(`Node executor not found: ${nodeType}`);
    }
    return executor;
  };

  has = (nodeType: NodeType): boolean => {
    return this.executors.has(nodeType);
  };
}
