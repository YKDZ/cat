/**
 * @zh 校验 finding 的严重程度。
 * @en Severity level of a validation finding.
 */
export type FindingSeverity = "error" | "warning" | "info";

/**
 * @zh 校验分层（Tier-1: 结构/manifest；Tier-2: 引用健康；Tier-3: 发布完整性）。
 * @en Validation tier (Tier-1: structural/manifest; Tier-2: reference health; Tier-3: publication integrity).
 */
export type FindingTier = 1 | 2 | 3;

/**
 * @zh 单条校验 finding。
 * @en A single validation finding.
 */
export interface ValidationFinding {
  /** @zh 严重程度 @en Severity */
  severity: FindingSeverity;
  /** @zh 分层编号 @en Tier number */
  tier: FindingTier;
  /** @zh 机器可读的错误代码 @en Machine-readable error code */
  code: string;
  /** @zh 人类可读的错误说明 @en Human-readable message */
  message: string;
  /** @zh 错误来源位置（如有） @en Source location (if applicable) */
  location?: {
    /** @zh 文件路径（相对于 workspace root） @en File path (relative to workspace root) */
    file: string;
    /** @zh 行号 @en Line number */
    line?: number;
  };
}

/**
 * @zh 判断 finding 数组中是否含有 error-severity 的条目。
 * @en Whether the findings array contains any error-severity entries.
 */
export const hasErrors = (findings: ValidationFinding[]): boolean =>
  findings.some((f) => f.severity === "error");

/**
 * @zh 格式化 finding 列表为人类可读的 CLI 输出。
 * @en Format a findings list into human-readable CLI output.
 */
export const formatFindings = (findings: ValidationFinding[]): string => {
  if (findings.length === 0) return "No validation findings.";

  return findings
    .map((f) => {
      const location = f.location
        ? `  → ${f.location.file}${f.location.line !== undefined ? `:${f.location.line}` : ""}`
        : "";
      return `[${f.severity.toUpperCase()}] [T${f.tier}] ${f.code}: ${f.message}${location ? "\n" + location : ""}`;
    })
    .join("\n");
};
