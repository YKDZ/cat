import type { TranslationSuggestion } from "@cat/shared";

/**
 * @zh 排序配置。
 * @en Sorting configuration.
 */
export interface QualitySortConfig {
  /** Maximum wait time in milliseconds (default 5000). */
  maxWaitMs: number;
  /** Minimum batch collection time in milliseconds (default 2000). */
  minBatchMs: number;
}

const DEFAULT_CONFIG: QualitySortConfig = {
  maxWaitMs: 5000,
  minBatchMs: 2000,
};

/**
 * @zh 带来源元数据的翻译建议包装。
 * @en Translation suggestion wrapper with source metadata.
 */
export interface QueuedSuggestion {
  suggestion: TranslationSuggestion;
  /** Source type for priority sorting: "llm-translate" or "advisor". */
  sourceType: "llm-translate" | "advisor";
  /** Timestamp when the suggestion was queued (ms). */
  arrivedAt: number;
  /** Whether this suggestion came from cache. */
  fromCache?: boolean;
  /** When this cached suggestion was queued. */
  cachedAt?: number;
}

/**
 * @zh 来源优先级映射。
 * @en Source priority mapping.
 */
const SOURCE_PRIORITY: Record<string, number> = {
  "llm-translate": 0,
  advisor: 1,
};

/**
 * @zh 按来源优先级 + 置信度降序 + 到达时间升序排序建议。
 *
 * 排序键（按序）：
 * 1. 来源优先级：LLM translate > advisor
 * 2. 置信度降序（同来源内）
 * 3. 到达时间升序（同优先级同置信度内，保持确定性）
 * @en Sort suggestions by source priority + confidence descending + arrival time ascending.
 *
 * Sort keys (in order):
 * 1. Source priority: LLM translate > advisor
 * 2. Confidence descending (within same source)
 * 3. Arrival time ascending (within same priority and confidence, deterministic)
 *
 * @param suggestions - {@zh 待排序建议列表} {@en List of suggestions to sort}
 * @returns - {@zh 排序后的建议列表} {@en Sorted suggestions}
 */
export const sortByQuality = (
  suggestions: QueuedSuggestion[],
): QueuedSuggestion[] => {
  return [...suggestions].sort((a, b) => {
    // Primary: source priority (lower = higher priority)
    const aPriority = SOURCE_PRIORITY[a.sourceType] ?? 2;
    const bPriority = SOURCE_PRIORITY[b.sourceType] ?? 2;
    if (aPriority !== bPriority) return aPriority - bPriority;

    // Secondary: confidence descending
    const aConf = a.suggestion.confidence ?? 0.5;
    const bConf = b.suggestion.confidence ?? 0.5;
    if (aConf !== bConf) return bConf - aConf;

    // Tertiary: arrival time ascending (deterministic)
    return a.arrivedAt - b.arrivedAt;
  });
};

/**
 * @zh 带有缓存延迟保护的建议收集器。
 *
 * 在 minBatchMs 内收集建议，然后按质量排序 yield。
 * 未在 maxWaitMs 内到达的建议追加到末尾。
 * @en Suggestion collector with cache-delay guard.
 *
 * Collects suggestions for minBatchMs, then sorts by quality and yields.
 * Suggestions arriving after maxWaitMs are appended to the end.
 *
 * @param config - {@zh 排序配置} {@en Sorting configuration}
 * @returns - {@zh 收集器 API} {@en Collector API}
 */
export const createSuggestionCollector = (
  config: Partial<QualitySortConfig> = {},
): {
  add: (item: QueuedSuggestion) => void;
  shouldYieldFirstBatch: () => boolean;
  isTimeout: () => boolean;
  yieldBatch: () => QueuedSuggestion[];
  yieldRemaining: () => QueuedSuggestion[];
} => {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const collected: QueuedSuggestion[] = [];
  let batchYielded = false;
  let startTime = Date.now();

  const add = (item: QueuedSuggestion): void => {
    collected.push({ ...item, arrivedAt: item.arrivedAt ?? Date.now() });
  };

  const shouldYieldFirstBatch = (): boolean => {
    const elapsed = Date.now() - startTime;
    return !batchYielded && elapsed >= cfg.minBatchMs && collected.length > 0;
  };

  const isTimeout = (): boolean => {
    return Date.now() - startTime >= cfg.maxWaitMs;
  };

  const yieldBatch = (): QueuedSuggestion[] => {
    if (collected.length === 0) return [];
    const sorted = sortByQuality(collected);
    collected.length = 0;
    batchYielded = true;
    return sorted;
  };

  const yieldRemaining = (): QueuedSuggestion[] => {
    if (collected.length === 0) return [];
    return sortByQuality([...collected]);
  };

  return { add, shouldYieldFirstBatch, isTimeout, yieldBatch, yieldRemaining };
};
