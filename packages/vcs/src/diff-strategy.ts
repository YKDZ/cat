/**
 * @zh 字段级变更描述
 * @en Field-level change description
 */
export interface FieldChange {
  path: string;
  type: "ADD" | "REMOVE" | "MODIFY";
  before: unknown;
  after: unknown;
  semanticHint?: string;
}

/**
 * @zh diff 计算结果
 * @en Diff computation result
 */
export interface DiffResult {
  entityType: string;
  changes: FieldChange[];
  semanticLabel: string;
  impactScope: "LOCAL" | "CASCADING";
}

/**
 * @zh 实体 diff 策略接口
 * @en Entity diff strategy interface
 */
export interface DiffStrategy<T = unknown> {
  diff(before: T | null, after: T | null): DiffResult;
  renderSummary(diff: DiffResult): string;
}
