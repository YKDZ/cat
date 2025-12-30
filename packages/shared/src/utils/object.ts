/**
 * 辅助函数：折叠大对象用于日志输出
 * - 数组显示为 Array(N)
 * - 对象显示为 {Object}
 * - 长字符串截断
 */
export const summarize = (obj: unknown): unknown => {
  if (obj === null || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return `[Array(${obj.length})]`;
  }

  const summary: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (key === "traceId") {
      summary[key] = value; // 保留 traceId
      continue;
    }

    if (Array.isArray(value)) {
      summary[key] = `[Array(${value.length})]`;
    } else if (typeof value === "object" && value !== null) {
      summary[key] = "{Object}";
    } else if (typeof value === "string" && value.length > 100) {
      summary[key] = `${value.slice(0, 100)}...`;
    } else {
      summary[key] = value;
    }
  }
  return summary;
};
