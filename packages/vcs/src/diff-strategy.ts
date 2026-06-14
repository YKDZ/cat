/**
 * Field-level change description
 */
export interface FieldChange {
  path: string;
  type: "ADD" | "REMOVE" | "MODIFY";
  before: unknown;
  after: unknown;
  semanticHint?: string;
}

/**
 * Diff computation result
 */
export interface DiffResult {
  entityType: string;
  changes: FieldChange[];
  semanticLabel: string;
  impactScope: "LOCAL" | "CASCADING";
}

/**
 * Entity diff strategy interface
 */
export interface DiffStrategy<T = unknown> {
  diff(before: T | null, after: T | null): DiffResult;
  renderSummary(diff: DiffResult): string;
}
