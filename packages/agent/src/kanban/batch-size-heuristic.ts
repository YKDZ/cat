/**
 * @zh Kanban 卡片 batchSize 自动计算启发式函数。
 * @en Heuristic function for automatically estimating Kanban card batchSize.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @zh `estimateBatchSize` 函数的输入参数。
 * @en Input parameters for the `estimateBatchSize` function.
 */
export interface BatchSizeInput {
  /** @zh 文档总元素数 @en Total number of elements in the document */
  totalElements: number;
  /** @zh 每个元素的平均字符长度 @en Average character length per element */
  avgElementLength: number;
  /** @zh 文档复杂度等级 @en Document complexity level */
  documentComplexity: "low" | "medium" | "high";
}

// ─── Heuristic ────────────────────────────────────────────────────────────────

/**
 * @zh 根据文档元素数量、平均长度和复杂度估算批处理大小。
 * @en Estimate batch size based on document elements, average length, and complexity.
 *
 * @param input - {@zh 批处理计算输入参数} {@en Batch size estimation inputs}
 * @returns {@zh 推荐的批处理大小（不超过 totalElements）} {@en Recommended batch size (capped at totalElements)}
 */
export const estimateBatchSize = (input: BatchSizeInput): number => {
  const baseLimits: Record<BatchSizeInput["documentComplexity"], number> = {
    low: 500,
    medium: 200,
    high: 100,
  };
  let limit = baseLimits[input.documentComplexity];
  if (input.avgElementLength > 500) {
    limit = Math.floor(limit / 2);
  }
  return Math.min(input.totalElements, limit);
};
