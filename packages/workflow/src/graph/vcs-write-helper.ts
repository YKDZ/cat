import type { SerializableType } from "@cat/shared";

import type { TypedNodeContext } from "@/graph/dsl/types";

/**
 * Execute a VCS-audited write in a graph node.
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
