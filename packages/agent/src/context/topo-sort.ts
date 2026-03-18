// ─── Circular Dependency Error ───

/**
 * 当 provider 依赖图中存在环路时抛出此错误。
 * cyclePath 包含构成环路的变量键名序列，用于调试。
 */
export class CircularDependencyError extends Error {
  readonly cyclePath: string[];

  constructor(cyclePath: string[]) {
    super(
      `Circular dependency detected in context providers: ${cyclePath.join(" → ")}`,
    );
    this.name = "CircularDependencyError";
    this.cyclePath = cyclePath;
  }
}

// ─── Provider Shape ───

type ProviderShape = {
  provides: ReadonlyArray<{ key: string }>;
  dependencies: ReadonlyArray<{ key: string; optional: boolean }>;
};

// ─── Topological Sort ───

/**
 * 对 provider 列表执行拓扑排序，返回分层结果。
 *
 * 算法：Kahn's Algorithm
 * 1. 构建 variableKey → providerIndex 的"谁提供了什么"映射
 * 2. 构建 providerIndex → Set<providerIndex> 的邻接表（依赖关系）
 * 3. 入度为 0 的 provider 先执行
 * 4. 若最终排序结果数量 < provider 数量，说明存在环路
 *
 * @returns 排序后的分层结果 layers，同一层可并行执行
 * @throws CircularDependencyError 当检测到环路时，附带环路路径信息
 */
export const topoSortProviders = (
  providers: ReadonlyArray<ProviderShape>,
): number[][] => {
  const n = providers.length;
  if (n === 0) return [];

  // Step 1: 构建 variableKey → providerIndex 映射
  const keyToProviderIndex = new Map<string, number>();
  for (let i = 0; i < n; i += 1) {
    const provider = providers[i];
    if (!provider) continue;
    for (const p of provider.provides) {
      keyToProviderIndex.set(p.key, i);
    }
  }

  // Step 2: 构建邻接表（adjacency）和入度表
  // adj[i] = Set of provider indices that depend on provider i
  const adj: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  const inDegree = new Array<number>(n).fill(0);

  for (let i = 0; i < n; i += 1) {
    const provider = providers[i];
    if (!provider) continue;
    for (const dep of provider.dependencies) {
      const depProviderIdx = keyToProviderIndex.get(dep.key);
      if (depProviderIdx === undefined) {
        // 种子变量或未知变量，跳过；引擎运行时会校验必需依赖
        continue;
      }
      if (depProviderIdx === i) {
        // 自依赖
        throw new CircularDependencyError([dep.key, dep.key]);
      }
      // provider i 依赖 depProviderIdx，所以 depProviderIdx → i
      if (!adj[depProviderIdx].has(i)) {
        adj[depProviderIdx].add(i);
        inDegree[i] += 1;
      }
    }
  }

  // Step 3: Kahn's BFS，按层收集
  const layers: number[][] = [];
  let queue: number[] = [];

  for (let i = 0; i < n; i += 1) {
    if (inDegree[i] === 0) queue.push(i);
  }

  let processed = 0;

  while (queue.length > 0) {
    layers.push([...queue]);
    const nextQueue: number[] = [];
    for (const idx of queue) {
      processed += 1;
      for (const neighbor of adj[idx] ?? []) {
        inDegree[neighbor] -= 1;
        if (inDegree[neighbor] === 0) {
          nextQueue.push(neighbor);
        }
      }
    }
    queue = nextQueue;
  }

  // Step 4: 环路检测
  if (processed < n) {
    // 找出未处理节点，通过 DFS 找一条具体环路
    const notProcessed = new Set<number>();
    for (let i = 0; i < n; i += 1) {
      if (inDegree[i] > 0) notProcessed.add(i);
    }
    const cyclePath = findCyclePath(notProcessed, adj, providers);
    throw new CircularDependencyError(cyclePath);
  }

  return layers;
};

/**
 * 在剩余未处理节点中通过 DFS 找到一条环路路径（变量键名序列）。
 */
const findCyclePath = (
  unprocessed: Set<number>,
  adj: Set<number>[],
  providers: ReadonlyArray<ProviderShape>,
): string[] => {
  const visited = new Set<number>();
  const stack = new Set<number>();
  const parent = new Map<number, number>();

  const dfs = (node: number): number[] | null => {
    visited.add(node);
    stack.add(node);

    for (const neighbor of adj[node] ?? []) {
      if (!unprocessed.has(neighbor)) continue;
      if (!visited.has(neighbor)) {
        parent.set(neighbor, node);
        const result = dfs(neighbor);
        if (result) return result;
      } else if (stack.has(neighbor)) {
        // 找到环路，回溯路径
        const cycle: number[] = [neighbor, node];
        let cur = node;
        while (cur !== neighbor) {
          const p = parent.get(cur);
          if (p === undefined) break;
          cycle.push(p);
          cur = p;
        }
        cycle.reverse();
        return cycle;
      }
    }

    stack.delete(node);
    return null;
  };

  for (const node of unprocessed) {
    if (!visited.has(node)) {
      const cycle = dfs(node);
      if (cycle) {
        // 将 provider 索引转换为可读的变量键名
        return cycle.map((idx) => {
          const p = providers[idx];
          return p?.provides[0]?.key ?? `provider[${idx}]`;
        });
      }
    }
  }

  return ["<unknown cycle>"];
};
