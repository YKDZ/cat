import type { SerializableType } from "@cat/shared/schema/json";

import type { TypedNodeContext } from "@/graph/typed-dsl/types";

/**
 * @zh 在 graph 节点中执行带 VCS 审计的写操作。
 * 当 VCSContext + VCSMiddleware 存在时，使用 interceptWrite 包装写入。
 * 当不存在时（测试或旧路径），直接执行 writeFn。
 * @en Execute a VCS-audited write in a graph node.
 * Uses interceptWrite when VCS is configured; falls back to direct writeFn otherwise.
 */
export async function executeWithVCS<T>(
  nodeCtx: TypedNodeContext,
  entityType: string,
  entityId: string,
  action: "CREATE" | "UPDATE" | "DELETE",
  before: SerializableType,
  after: SerializableType,
  writeFn: () => Promise<T>,
): Promise<T> {
  if (!nodeCtx.vcsContext || !nodeCtx.vcsMiddleware) {
    return writeFn();
  }
  return nodeCtx.vcsMiddleware.interceptWrite(
    nodeCtx.vcsContext,
    entityType,
    entityId,
    action,
    before,
    after,
    writeFn,
  );
}
