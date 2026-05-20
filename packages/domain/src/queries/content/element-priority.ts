import type {
  EditorElement,
  ElementPriorityReasonCode,
  ElementPrioritySummary,
  ElementSortMode,
} from "@cat/shared";

/**
 * @zh reuse-first 在单个 scope 内可排序的最大元素数，超过时结构顺序回退。
 * @en Maximum rows ranked by reuse-first inside one scope before structural fallback.
 */
export const MAX_REUSE_FIRST_SCOPE_ROWS = 5000;

const NEIGHBOR_WINDOW = 3;
const MAX_NGRAM = 4;

/**
 * @zh 可参与优先级排序的编辑器元素行，包含结构顺序位置。
 * @en Editor element row that can participate in priority ranking, including structural position.
 */
export type PriorityRankableEditorElement = EditorElement & {
  position: number;
};

/**
 * @zh 单个元素在优先级计划中的排序结果。
 * @en Ranked result for a single element inside the priority plan.
 */
export type ElementPriorityPlanItem = {
  id: number;
  summary: ElementPrioritySummary;
};

/**
 * @zh 当前作用域的临时元素优先级计划。
 * @en Ephemeral element-priority plan for the current scope.
 */
export type ElementPriorityPlan = {
  mode: ElementSortMode;
  items: ElementPriorityPlanItem[];
  summaryById: Map<number, ElementPrioritySummary>;
  fallbackReason: ElementPriorityReasonCode | null;
};

type ElementFeature = {
  row: PriorityRankableEditorElement;
  normalizedText: string;
  tokens: string[];
  tokenSet: Set<string>;
  ngrams: Set<string>;
  templateSignature: string;
  placeholderCount: number;
  contentLength: number;
};

type ElementPriorityScore = {
  reuseDemandScore: number;
  templateScore: number;
  neighborContextScore: number;
  foundationScore: number;
  complexityPenalty: number;
  totalScore: number;
};

const normalizeText = (value: string): string =>
  value.normalize("NFKC").trim().toLocaleLowerCase();

const placeholderRegex =
  /\{[^}]+\}|\$\{[^}]+\}|%[sdif]|%\([^)]+\)[sdif]|\{\{[^}]+\}\}/gu;
const tokenRegex = /[\p{L}\p{N}]+/gu;

const segmentWords = (text: string, languageId: string): string[] => {
  const normalized = normalizeText(text);
  const segmenterCtor = Intl.Segmenter;

  if (segmenterCtor) {
    try {
      const segmenter = new segmenterCtor(languageId, { granularity: "word" });
      const words = [...segmenter.segment(normalized)]
        .filter((segment) => segment.isWordLike)
        .map((segment) => segment.segment.trim())
        .filter((segment) => segment.length > 0);
      if (words.length > 0) {
        return words;
      }
    } catch {
      // Invalid BCP-47 language tags or runtime Intl failures fall back to regex.
    }
  }

  return [...normalized.matchAll(tokenRegex)].map((match) => match[0]);
};

const buildNgrams = (tokens: string[]): Set<string> => {
  const ngrams = new Set<string>();
  for (let start = 0; start < tokens.length; start += 1) {
    for (
      let size = 1;
      size <= MAX_NGRAM && start + size <= tokens.length;
      size += 1
    ) {
      ngrams.add(tokens.slice(start, start + size).join(" "));
    }
  }
  return ngrams;
};

const extractFeature = (row: PriorityRankableEditorElement): ElementFeature => {
  const normalizedText = normalizeText(row.value);
  const placeholders = normalizedText.match(placeholderRegex) ?? [];
  const tokens = segmentWords(
    normalizedText.replace(placeholderRegex, " "),
    row.languageId,
  );

  return {
    row,
    normalizedText,
    tokens,
    tokenSet: new Set(tokens),
    ngrams: buildNgrams(tokens),
    templateSignature: normalizedText
      .replace(placeholderRegex, "{var}")
      .replace(/\d+/gu, "#"),
    placeholderCount: placeholders.length,
    contentLength: normalizedText.length,
  };
};

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) {
      intersection += 1;
    }
  }
  return intersection / (a.size + b.size - intersection);
};

const isLikelySeed = (feature: ElementFeature): boolean =>
  feature.contentLength > 0 &&
  feature.contentLength <= 48 &&
  feature.tokens.length > 0 &&
  feature.tokens.length <= 5 &&
  feature.placeholderCount <= 2;

const computeSeedReuseScore = (
  feature: ElementFeature,
  all: ElementFeature[],
): number => {
  if (!isLikelySeed(feature)) return 0;

  let matches = 0;
  for (const other of all) {
    if (other.row.id === feature.row.id) continue;
    if (other.normalizedText.includes(feature.normalizedText)) {
      matches += 1;
      continue;
    }
    if (
      feature.tokens.length > 0 &&
      feature.tokens.every((token) => other.tokenSet.has(token))
    ) {
      matches += 1;
    }
  }

  return Math.min(1, matches / 4);
};

const computeTemplateScore = (
  feature: ElementFeature,
  all: ElementFeature[],
): number => {
  if (feature.templateSignature === feature.normalizedText) return 0;

  const sameTemplateCount = all.filter(
    (other) =>
      other.row.id !== feature.row.id &&
      other.templateSignature === feature.templateSignature,
  ).length;
  return Math.min(1, sameTemplateCount / 3);
};

const computeNeighborScore = (
  feature: ElementFeature,
  byNode: Map<string, ElementFeature[]>,
): number => {
  const siblings = byNode.get(feature.row.primaryContentNodeId) ?? [];
  const index = siblings.findIndex((item) => item.row.id === feature.row.id);
  if (index === -1) return 0;

  let score = 0;
  for (let offset = -NEIGHBOR_WINDOW; offset <= NEIGHBOR_WINDOW; offset += 1) {
    if (offset === 0) continue;
    const neighbor = siblings[index + offset];
    if (!neighbor) continue;
    const overlap = jaccard(feature.tokenSet, neighbor.tokenSet);
    const distanceWeight =
      (NEIGHBOR_WINDOW + 1 - Math.abs(offset)) / NEIGHBOR_WINDOW;
    score += overlap * distanceWeight;
  }
  return Math.min(1, score / 2);
};

const computeFeatureScore = (
  feature: ElementFeature,
  all: ElementFeature[],
  byNode: Map<string, ElementFeature[]>,
): {
  score: ElementPriorityScore;
  confidence: number;
  reasonCodes: ElementPriorityReasonCode[];
} => {
  const seedReuse = computeSeedReuseScore(feature, all);
  const template = computeTemplateScore(feature, all);
  const neighbor = computeNeighborScore(feature, byNode);
  const foundation = isLikelySeed(feature) ? 0.35 : 0;
  const complexityPenalty = Math.min(
    0.3,
    Math.max(0, (feature.contentLength - 80) / 400),
  );

  const raw =
    seedReuse * 0.42 +
    template * 0.24 +
    neighbor * 0.18 +
    foundation * 0.16 -
    complexityPenalty;
  const totalScore = Math.max(0, Math.min(1, raw));

  const reasonCodes: ElementPriorityReasonCode[] = [];
  if (seedReuse >= 0.2) reasonCodes.push("REUSE_SEED");
  if (template >= 0.2) reasonCodes.push("TEMPLATE_MATCH");
  if (neighbor >= 0.15) reasonCodes.push("NEIGHBOR_CONTEXT");
  if (foundation > 0) reasonCodes.push("FOUNDATION");
  if (totalScore < 0.15) reasonCodes.push("LOW_CONFIDENCE");

  return {
    score: {
      reuseDemandScore: seedReuse,
      templateScore: template,
      neighborContextScore: neighbor,
      foundationScore: foundation,
      complexityPenalty,
      totalScore,
    },
    confidence: Math.max(0.25, Math.min(1, 0.45 + totalScore * 0.55)),
    reasonCodes,
  };
};

const structuralSummary = (
  row: PriorityRankableEditorElement,
  priorityPosition: number,
  fallbackReason: ElementPriorityReasonCode | null,
): ElementPrioritySummary => ({
  mode: fallbackReason ? "reuse-first" : "structure",
  score: 0,
  confidence: fallbackReason ? 1 : 0,
  reasonCodes: fallbackReason ? [fallbackReason] : [],
  structurePosition: row.position,
  priorityPosition,
});

/**
 * @zh 构建当前编辑器 scope 的临时元素优先级计划。
 * @en Build an ephemeral element-priority plan for the current editor scope.
 *
 * @param rows - {@zh 已按结构顺序排序并携带 position 的 scope 行} {@en Scope rows already sorted structurally and carrying positions}
 * @param sortMode - {@zh 当前请求的排序模式} {@en Requested sort mode}
 * @returns - {@zh 作用域内的优先级计划} {@en Priority plan for the scope}
 */
export const buildElementPriorityPlan = (
  rows: PriorityRankableEditorElement[],
  sortMode: ElementSortMode,
): ElementPriorityPlan => {
  if (sortMode === "structure") {
    const items = rows.map((row, index) => ({
      id: row.id,
      summary: structuralSummary(row, index, null),
    }));
    return {
      mode: "structure",
      items,
      summaryById: new Map(items.map((item) => [item.id, item.summary])),
      fallbackReason: null,
    };
  }

  if (rows.length > MAX_REUSE_FIRST_SCOPE_ROWS) {
    const items = rows.map((row, index) => ({
      id: row.id,
      summary: structuralSummary(row, index, "STRUCTURE_FALLBACK"),
    }));
    return {
      mode: "reuse-first",
      items,
      summaryById: new Map(items.map((item) => [item.id, item.summary])),
      fallbackReason: "STRUCTURE_FALLBACK",
    };
  }

  const features = rows.map(extractFeature);
  const byNode = new Map<string, ElementFeature[]>();
  for (const feature of features) {
    const siblings = byNode.get(feature.row.primaryContentNodeId) ?? [];
    siblings.push(feature);
    byNode.set(feature.row.primaryContentNodeId, siblings);
  }
  for (const siblings of byNode.values()) {
    siblings.sort((a, b) => a.row.position - b.row.position);
  }

  const scored = features.map((feature) => {
    const { score, confidence, reasonCodes } = computeFeatureScore(
      feature,
      features,
      byNode,
    );
    return { feature, score, confidence, reasonCodes };
  });

  scored.sort((a, b) => {
    const scoreDiff = b.score.totalScore - a.score.totalScore;
    if (Math.abs(scoreDiff) > 0.000001) return scoreDiff;
    return a.feature.row.position - b.feature.row.position;
  });

  const items = scored.map((item, priorityPosition) => ({
    id: item.feature.row.id,
    summary: {
      mode: "reuse-first" as const,
      score: item.score.totalScore,
      confidence: item.confidence,
      reasonCodes: item.reasonCodes,
      structurePosition: item.feature.row.position,
      priorityPosition,
    },
  }));

  return {
    mode: "reuse-first",
    items,
    summaryById: new Map(items.map((item) => [item.id, item.summary])),
    fallbackReason: null,
  };
};

/**
 * @zh 按优先级计划重排 rows，并附加轻量 priority 摘要。
 * @en Reorder rows by a priority plan and attach lightweight priority summaries.
 *
 * @param rows - {@zh 原始 scope 行} {@en Original scope rows}
 * @param plan - {@zh 当前 scope 的优先级计划} {@en Priority plan for the current scope}
 * @returns - {@zh 重新排序后的 scope 行} {@en Reordered scope rows}
 */
export const orderRowsByPriorityPlan = <
  T extends PriorityRankableEditorElement,
>(
  rows: T[],
  plan: ElementPriorityPlan,
): Array<T & { priority?: ElementPrioritySummary }> => {
  if (plan.mode === "structure" && plan.fallbackReason === null) {
    return rows;
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  return plan.items
    .map((item) => {
      const row = byId.get(item.id);
      return row
        ? {
            ...row,
            position: item.summary.priorityPosition,
            priority: item.summary,
          }
        : null;
    })
    .filter(
      (row): row is T & { priority: ElementPrioritySummary } => row !== null,
    );
};
