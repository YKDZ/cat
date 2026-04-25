import type { JSONType } from "@cat/shared";

import type { DiffResult, DiffStrategy } from "./diff-strategy.ts";

/**
 * @zh 实体 diff 策略注册表。每种 entityType 注册一个策略。
 * @en Entity diff strategy registry. One strategy per entityType.
 */
export class DiffStrategyRegistry {
  private readonly strategies = new Map<string, DiffStrategy>();

  /**
   * @zh 注册某 entityType 的 diff 策略
   * @en Register a diff strategy for an entityType
   */
  register(entityType: string, strategy: DiffStrategy): void {
    this.strategies.set(entityType, strategy);
  }

  /**
   * @zh 获取某 entityType 的策略（不存在时抛出）
   * @en Get strategy for entityType (throws if not found)
   */
  get(entityType: string): DiffStrategy {
    const strategy = this.strategies.get(entityType);
    if (!strategy) {
      throw new Error(
        `No diff strategy registered for entity type: ${entityType}`,
      );
    }
    return strategy;
  }

  /**
   * @zh 是否已注册该 entityType
   * @en Whether the entityType has a registered strategy
   */
  has(entityType: string): boolean {
    return this.strategies.has(entityType);
  }

  /**
   * @zh 对指定 entityType 执行 diff 计算
   * @en Compute diff for the given entityType
   */
  diff(entityType: string, before: JSONType, after: JSONType): DiffResult {
    return this.get(entityType).diff(before, after);
  }
}
