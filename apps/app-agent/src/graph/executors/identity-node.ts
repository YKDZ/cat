import type { NodeExecutor } from "@/graph/node-registry";

/**
 * 占位执行器：parallel/join/loop/transform/subgraph 在后续阶段扩展。
 */
export const IdentityNodeExecutor: NodeExecutor = async () => {
  return {
    status: "completed",
  };
};
