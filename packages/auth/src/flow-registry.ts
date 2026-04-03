import type { AuthFlowDefinition } from "./types.ts";

// ====== DAG Validation ======

export class AuthFlowValidationError extends Error {
  constructor(
    public readonly flowId: string,
    public readonly issues: string[],
  ) {
    super(
      `AuthFlow "${flowId}" validation failed:\n${issues.map((i) => `  - ${i}`).join("\n")}`,
    );
    this.name = "AuthFlowValidationError";
  }
}

/**
 * 拓扑排序 + 环检测 (DFS)。
 * 返回 true 表示有环。
 */
const hasCycle = (
  nodeIds: string[],
  adjacency: Map<string, string[]>,
): boolean => {
  const visited = new Set<string>();
  const inStack = new Set<string>();

  const dfs = (id: string): boolean => {
    visited.add(id);
    inStack.add(id);
    for (const neighbor of adjacency.get(id) ?? []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (inStack.has(neighbor)) {
        return true;
      }
    }
    inStack.delete(id);
    return false;
  };

  for (const id of nodeIds) {
    if (!visited.has(id)) {
      if (dfs(id)) return true;
    }
  }
  return false;
};

/**
 * 可达性检测：从 start 出发能否到达 targets 中任一节点。
 */
const canReach = (
  start: string,
  targets: Set<string>,
  adjacency: Map<string, string[]>,
): boolean => {
  const queue: string[] = [start];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (targets.has(current)) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      queue.push(next);
    }
  }
  return false;
};

export const validateAuthFlow = (flow: AuthFlowDefinition): void => {
  const issues: string[] = [];
  const nodeIds = Object.keys(flow.nodes);

  // 1. entry 节点必须存在
  if (!flow.nodes[flow.entry]) {
    issues.push(`entry node "${flow.entry}" is not defined in nodes`);
  }

  // 2. 所有终止节点必须存在
  for (const id of [
    ...flow.terminalNodes.success,
    ...flow.terminalNodes.failure,
  ]) {
    if (!flow.nodes[id]) {
      issues.push(`terminal node "${id}" is not defined in nodes`);
    }
  }

  // 3. 所有边的 from/to 必须存在
  const adjacency = new Map<string, string[]>();
  for (const id of nodeIds) adjacency.set(id, []);

  for (const edge of flow.edges) {
    if (!flow.nodes[edge.from]) {
      issues.push(`edge references unknown source node "${edge.from}"`);
    }
    if (!flow.nodes[edge.to]) {
      issues.push(`edge references unknown target node "${edge.to}"`);
    }
    if (flow.nodes[edge.from] && flow.nodes[edge.to]) {
      adjacency.get(edge.from)!.push(edge.to);
    }
  }

  // 快速失败：如果节点引用有误，跳过后续检查避免误报
  if (issues.length > 0) {
    throw new AuthFlowValidationError(flow.id, issues);
  }

  // 4. 环检测
  if (hasCycle(nodeIds, adjacency)) {
    issues.push("DAG contains a cycle");
  }

  // 5. 从 entry 出发，每个非终止节点都应能到达至少一个终止节点
  const allTerminals = new Set([
    ...flow.terminalNodes.success,
    ...flow.terminalNodes.failure,
  ]);
  for (const id of nodeIds) {
    if (allTerminals.has(id)) continue;
    if (!canReach(id, allTerminals, adjacency)) {
      issues.push(`node "${id}" cannot reach any terminal node`);
    }
  }

  if (issues.length > 0) {
    throw new AuthFlowValidationError(flow.id, issues);
  }
};

// ====== Flow Registry ======

export class AuthFlowRegistry {
  private readonly flows = new Map<string, AuthFlowDefinition>();

  register(flow: AuthFlowDefinition, validate = true): void {
    if (validate) {
      validateAuthFlow(flow);
    }
    const key = `${flow.id}@${flow.version}`;
    this.flows.set(key, flow);
    // 同时以 id 为 key 保存最新版本
    this.flows.set(flow.id, flow);
  }

  get(id: string, version?: string): AuthFlowDefinition | undefined {
    if (version) {
      return this.flows.get(`${id}@${version}`);
    }
    return this.flows.get(id);
  }

  list(): AuthFlowDefinition[] {
    // 只返回 "id@version" 格式的记录，去重
    const result: AuthFlowDefinition[] = [];
    for (const [key, flow] of this.flows.entries()) {
      if (key.includes("@")) result.push(flow);
    }
    return result;
  }
}
