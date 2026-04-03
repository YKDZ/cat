import type { AuthNodeExecutor, AuthNodeType } from "./types.ts";

// ====== Node Registry ======

export class AuthNodeRegistry {
  private readonly executors = new Map<string, AuthNodeExecutor>();

  /**
   * 注册节点执行器。
   * key 可以是节点类型（如 "credential_collector"），也可以是具体 factorId（如 "PASSWORD"）。
   * factorId 的优先级高于节点类型。
   */
  register(
    key: AuthNodeType | (string & {}),
    executor: AuthNodeExecutor,
  ): void {
    this.executors.set(key, executor);
  }

  /**
   * 解析执行器：先按 factorId 查找，再按 nodeType fallback。
   */
  resolve(
    nodeType: AuthNodeType,
    factorId?: string,
  ): AuthNodeExecutor | undefined {
    if (factorId) {
      const byFactor = this.executors.get(factorId);
      if (byFactor) return byFactor;
    }
    return this.executors.get(nodeType);
  }

  has(key: AuthNodeType | (string & {})): boolean {
    return this.executors.has(key);
  }
}
