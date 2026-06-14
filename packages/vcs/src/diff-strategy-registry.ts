import type { JSONType } from "@cat/shared";

import type { DiffResult, DiffStrategy } from "./diff-strategy.ts";

/**
 * Entity diff strategy registry. One strategy per entityType.
 */
export class DiffStrategyRegistry {
  private readonly strategies = new Map<string, DiffStrategy>();

  /**
   * Register a diff strategy for an entityType
   */
  register(entityType: string, strategy: DiffStrategy): void {
    this.strategies.set(entityType, strategy);
  }

  /**
   * Get strategy for entityType (throws if not found)
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
   * Whether the entityType has a registered strategy
   */
  has(entityType: string): boolean {
    return this.strategies.has(entityType);
  }

  /**
   * Compute diff for the given entityType
   */
  diff(entityType: string, before: JSONType, after: JSONType): DiffResult {
    return this.get(entityType).diff(before, after);
  }
}
