import { deepMerge } from "@cat/graph";

import type { AuthBlackboardData } from "./types.ts";

import { AuthBlackboardDataSchema } from "./types.ts";

export interface AuthBlackboardSnapshot {
  flowId: string;
  version: number;
  data: AuthBlackboardData;
  security: {
    csrfToken: string;
    ipHash: string;
    startedAt: string;
    expiresAt: string;
    stepNonces: Record<string, string>;
  };
  createdAt: string;
  updatedAt: string;
}

export const createAuthBlackboard = (args: {
  flowId: string;
  flowDefId: string;
  entryNode: string;
  security: AuthBlackboardSnapshot["security"];
}): AuthBlackboardSnapshot => ({
  flowId: args.flowId,
  version: 0,
  data: {
    flowDefId: args.flowDefId,
    currentNode: args.entryNode,
    completedNodes: [],
    status: "pending",
    identity: {},
    aal: 0,
    completedFactors: [],
    nodeOutputs: {},
    pluginData: {},
  },
  security: args.security,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export const applyBlackboardUpdate = (
  snapshot: AuthBlackboardSnapshot,
  updates: Record<string, unknown>,
): AuthBlackboardSnapshot => {
  const merged = deepMerge(
    structuredClone(snapshot.data) as Record<string, unknown>,
    updates,
  );
  const validated = AuthBlackboardDataSchema.parse(merged);
  return {
    ...snapshot,
    version: snapshot.version + 1,
    data: validated,
    updatedAt: new Date().toISOString(),
  };
};
