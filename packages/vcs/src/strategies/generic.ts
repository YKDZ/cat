import type {
  DiffResult,
  DiffStrategy,
  FieldChange,
} from "../diff-strategy.ts";

/**
 * @zh 对两个对象进行浅层字段级 diff，返回所有发生变化的字段
 * @en Shallow field-level diff between two objects, returning changed fields
 */
export const shallowDiff = (
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): FieldChange[] => {
  const changes: FieldChange[] = [];
  const allKeys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);

  for (const key of allKeys) {
    const beforeVal = before?.[key];
    const afterVal = after?.[key];

    if (before === null) {
      changes.push({
        path: key,
        type: "ADD",
        before: undefined,
        after: afterVal,
      });
    } else if (after === null) {
      changes.push({
        path: key,
        type: "REMOVE",
        before: beforeVal,
        after: undefined,
      });
    } else if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      changes.push({
        path: key,
        type: "MODIFY",
        before: beforeVal,
        after: afterVal,
      });
    }
  }

  return changes;
};

/**
 * @zh 通用策略工厂：基于 shallowDiff 构建简单策略
 * @en Generic strategy factory using shallowDiff
 */
export const createGenericStrategy = (options: {
  entityType: string;
  semanticLabel: string;
  impactScope: "LOCAL" | "CASCADING";
  watchedFields?: string[];
}): DiffStrategy => ({
  diff(before: unknown, after: unknown): DiffResult {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const beforeObj = (
      typeof before === "object" && before !== null ? before : {}
    ) as Record<string, unknown>;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const afterObj = (
      typeof after === "object" && after !== null ? after : {}
    ) as Record<string, unknown>;

    const allChanges = shallowDiff(
      before === null ? null : beforeObj,
      after === null ? null : afterObj,
    );

    // Filter by watched fields if specified
    const changes = options.watchedFields
      ? allChanges.filter((c) => options.watchedFields!.includes(c.path))
      : allChanges;

    return {
      entityType: options.entityType,
      changes,
      semanticLabel: options.semanticLabel,
      impactScope: options.impactScope,
    };
  },
  renderSummary(diff: DiffResult): string {
    if (diff.changes.length === 0) return `${diff.semanticLabel}: no changes`;
    const fieldNames = diff.changes.map((c) => c.path).join(", ");
    return `${diff.semanticLabel}: changed [${fieldNames}]`;
  },
});
