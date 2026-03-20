import type { OperationContext } from "@cat/domain";
import type { NlpToken } from "@cat/shared/schema/nlp";

import * as z from "zod";

import { nlpBatchSegmentOp } from "./nlp-batch-segment";

// ─── Types ───

/**
 * Accumulates frequency statistics for a candidate N-gram.
 */
type NgramAccumulator = {
  /** Total term frequency across all elements */
  tf: number;
  /** Number of distinct elements containing this N-gram */
  df: number;
  /** Per-element occurrence data (used for C-value and output) */
  elementOccurrences: Map<number, Array<{ start: number; end: number }>>;
  /** Surface forms and their frequencies */
  surfaceForms: Map<string, number>;
  /** POS pattern of this N-gram (UPOS tag sequence) */
  posPattern: string[];
  /** Number of tokens in this N-gram */
  tokenCount: number;
};

// ─── POS Filter ───

/**
 * Valid POS patterns for terminology (UPOS tag patterns).
 * These cover the most common patterns cited in NLP terminology extraction literature.
 * Applied only when NLP plugin is available (pos !== "X").
 */
const VALID_POS_PATTERNS: Array<string[]> = [
  // Single tokens
  ["NOUN"],
  ["PROPN"],
  // Two-token
  ["NOUN", "NOUN"],
  ["ADJ", "NOUN"],
  ["PROPN", "NOUN"],
  ["NOUN", "PROPN"],
  ["PROPN", "PROPN"],
  ["VERB", "NOUN"],
  ["NOUN", "VERB"],
  // Three-token
  ["NOUN", "NOUN", "NOUN"],
  ["ADJ", "NOUN", "NOUN"],
  ["NOUN", "ADP", "NOUN"],
  ["ADJ", "ADJ", "NOUN"],
  ["VERB", "ADJ", "NOUN"],
  ["NOUN", "NOUN", "VERB"],
  // Four-token (multi-word terms)
  ["ADJ", "NOUN", "ADP", "NOUN"],
  ["NOUN", "ADP", "ADJ", "NOUN"],
  ["NOUN", "NOUN", "ADP", "NOUN"],
];

const isValidPosPattern = (pattern: string[]): boolean => {
  if (pattern.length === 0) return false;
  // When all tokens are "X" (Intl.Segmenter fallback), skip POS filtering
  if (pattern.every((p) => p === "X")) return true;
  return VALID_POS_PATTERNS.some(
    (valid) =>
      valid.length === pattern.length &&
      valid.every((p, i) => p === pattern[i]),
  );
};

// ─── C-value Computation ───

/**
 * Compute C-value for a candidate term.
 *
 * C-value(a) = log2(|a|) * (f(a) - (1 / |T_a|) * Σ f(b))
 * where T_a = set of longer candidates containing a as a substring.
 */
const computeCValue = (
  normalizedText: string,
  tokenCount: number,
  tf: number,
  ngramMap: Map<string, NgramAccumulator>,
): number => {
  if (tokenCount === 1) {
    // Single tokens: C-value = log2(1) * f(a) = 0, but return tf as fallback
    return tf;
  }

  const longerCandidates: number[] = [];
  for (const [candidate, acc] of ngramMap) {
    if (acc.tokenCount > tokenCount && candidate.includes(normalizedText)) {
      longerCandidates.push(acc.tf);
    }
  }

  const superStringFreq =
    longerCandidates.length > 0
      ? longerCandidates.reduce((sum, f) => sum + f, 0) /
        longerCandidates.length
      : 0;

  return Math.log2(tokenCount) * (tf - superStringFreq);
};

// ─── Input / Output Schemas ───

export const StatisticalTermExtractInputSchema = z.object({
  texts: z.array(
    z.object({
      /** Element ID (stringified for NLP batch API) */
      id: z.string(),
      elementId: z.int(),
      text: z.string(),
    }),
  ),
  languageId: z.string().min(1),
  nlpSegmenterId: z.int().optional(),
  config: z.object({
    maxTermTokens: z.int().min(1).max(10).default(5),
    minDocFreq: z.int().min(1).default(2),
    minTermLength: z.int().min(1).default(2),
    tfIdfThreshold: z.number().min(0).max(1).default(0.05),
    tfidfWeight: z.number().min(0).max(1).default(0.6),
    cvalueWeight: z.number().min(0).max(1).default(0.4),
  }),
});

export const StatisticalTermExtractOutputSchema = z.object({
  candidates: z.array(
    z.object({
      text: z.string(),
      normalizedText: z.string(),
      posPattern: z.array(z.string()),
      confidence: z.number().min(0).max(1),
      frequency: z.int(),
      documentFrequency: z.int(),
      occurrences: z.array(
        z.object({
          elementId: z.int(),
          ranges: z.array(z.object({ start: z.int(), end: z.int() })),
        }),
      ),
    }),
  ),
  nlpSegmenterUsed: z.enum(["plugin", "intl-fallback"]),
});

export type StatisticalTermExtractInput = z.infer<
  typeof StatisticalTermExtractInputSchema
>;
export type StatisticalTermExtractOutput = z.infer<
  typeof StatisticalTermExtractOutputSchema
>;

// ─── Join CJK tokens without space ───

/** For CJK languages, tokens are joined without spaces; others with a space. */
const isCjkLanguage = (languageId: string): boolean => {
  const lang = languageId.split("-")[0]?.toLowerCase() ?? "";
  return ["zh", "ja", "ko"].includes(lang);
};

const joinTokens = (tokens: NlpToken[], languageId: string): string => {
  const separator = isCjkLanguage(languageId) ? "" : " ";
  return tokens.map((t) => t.text).join(separator);
};

const joinLemmas = (tokens: NlpToken[], languageId: string): string => {
  const separator = isCjkLanguage(languageId) ? "" : " ";
  return tokens.map((t) => t.lemma).join(separator);
};

// ─── Core Operation ───

/**
 * 统计学术语提取
 *
 * 内部调用 nlpBatchSegmentOp 进行 NLP 分词，然后通过 POS 过滤 + N-gram 生成
 * + TF-IDF + C-value 算法提取高置信度术语候选。
 */
export const statisticalTermExtractOp = async (
  data: StatisticalTermExtractInput,
  ctx?: OperationContext,
): Promise<StatisticalTermExtractOutput> => {
  if (data.texts.length === 0) {
    return { candidates: [], nlpSegmenterUsed: "intl-fallback" };
  }

  // === Phase A: NLP Segmentation ===
  const segmentResult = await nlpBatchSegmentOp(
    {
      items: data.texts.map((t) => ({ id: t.id, text: t.text })),
      languageId: data.languageId,
      nlpSegmenterId: data.nlpSegmenterId,
    },
    ctx,
  );

  // Detect whether a real NLP plugin was used (pos tags other than X/NUM/PUNCT)
  const hasNlpPlugin = segmentResult.results.some((r) =>
    r.result.tokens.some(
      (t) => t.pos !== "X" && t.pos !== "NUM" && t.pos !== "PUNCT",
    ),
  );

  // Build a map from item id → elementId
  const idToElementId = new Map<string, number>(
    data.texts.map((t) => [t.id, t.elementId]),
  );

  const ngramMap = new Map<string, NgramAccumulator>();
  const { maxTermTokens, minTermLength } = data.config;

  // === Phase A: N-gram generation per element ===
  for (const { id, result } of segmentResult.results) {
    const elementId = idToElementId.get(id);
    if (elementId === undefined) continue;

    // Filter stop words and punctuation to get content token sequence
    const contentTokens = result.tokens.filter((t) => !t.isStop && !t.isPunct);

    for (let n = 1; n <= maxTermTokens; n += 1) {
      for (let i = 0; i <= contentTokens.length - n; i += 1) {
        const slice = contentTokens.slice(i, i + n);
        const posPattern = slice.map((t) => t.pos);

        // POS filter (skip when no NLP plugin and pos = "X")
        if (hasNlpPlugin && !isValidPosPattern(posPattern)) continue;

        const surfaceText = joinTokens(slice, data.languageId);
        const normalizedText = joinLemmas(slice, data.languageId);

        // Basic length filter
        if (surfaceText.length < minTermLength) continue;
        // Skip pure-numeric candidates
        if (/^\d+([.,]\d+)*$/.test(normalizedText)) continue;

        // Compute character range for this N-gram
        const start = slice[0]?.start ?? 0;
        const end = slice[slice.length - 1]?.end ?? surfaceText.length;

        let acc = ngramMap.get(normalizedText);
        if (!acc) {
          acc = {
            tf: 0,
            df: 0,
            elementOccurrences: new Map(),
            surfaceForms: new Map(),
            posPattern,
            tokenCount: n,
          };
          ngramMap.set(normalizedText, acc);
        }

        acc.tf += 1;

        const elementRanges = acc.elementOccurrences.get(elementId);
        if (elementRanges) {
          elementRanges.push({ start, end });
        } else {
          acc.elementOccurrences.set(elementId, [{ start, end }]);
          acc.df += 1;
        }

        const currentCount = acc.surfaceForms.get(surfaceText) ?? 0;
        acc.surfaceForms.set(surfaceText, currentCount + 1);
      }
    }
  }

  // === Phase B: TF-IDF + C-value Scoring ===
  const N = data.texts.length;
  const { minDocFreq, tfIdfThreshold, tfidfWeight, cvalueWeight } = data.config;

  // First pass: compute raw TF-IDF and C-value for all candidates
  type RawCandidate = {
    normalizedText: string;
    tfidf: number;
    cvalue: number;
    acc: NgramAccumulator;
  };

  const rawCandidates: RawCandidate[] = [];

  for (const [normalizedText, acc] of ngramMap) {
    if (acc.df < minDocFreq) continue;

    const tfidf = acc.tf * Math.log((N + 1) / (acc.df + 1));
    const cvalue = computeCValue(
      normalizedText,
      acc.tokenCount,
      acc.tf,
      ngramMap,
    );

    rawCandidates.push({
      normalizedText,
      tfidf,
      cvalue: Math.max(0, cvalue),
      acc,
    });
  }

  if (rawCandidates.length === 0) {
    return {
      candidates: [],
      nlpSegmenterUsed: hasNlpPlugin ? "plugin" : "intl-fallback",
    };
  }

  // Normalize TF-IDF and C-value to [0, 1]
  const maxTfidf = Math.max(...rawCandidates.map((c) => c.tfidf), 1e-10);
  const maxCvalue = Math.max(...rawCandidates.map((c) => c.cvalue), 1e-10);

  const candidates: StatisticalTermExtractOutput["candidates"] = [];

  for (const { normalizedText, tfidf, cvalue, acc } of rawCandidates) {
    const normTfidf = tfidf / maxTfidf;
    const normCvalue = cvalue / maxCvalue;
    const confidence = tfidfWeight * normTfidf + cvalueWeight * normCvalue;

    if (confidence < tfIdfThreshold) continue;

    // Choose most frequent surface form
    let mostFrequentSurface = normalizedText;
    let maxSurfaceCount = 0;
    for (const [surface, count] of acc.surfaceForms) {
      if (count > maxSurfaceCount) {
        maxSurfaceCount = count;
        mostFrequentSurface = surface;
      }
    }

    // Build sampled occurrences (max 10 elements)
    const occurrences: StatisticalTermExtractOutput["candidates"][number]["occurrences"] =
      [];
    for (const [elementId, ranges] of acc.elementOccurrences) {
      if (occurrences.length >= 10) break;
      occurrences.push({ elementId, ranges });
    }

    candidates.push({
      text: mostFrequentSurface,
      normalizedText,
      posPattern: acc.posPattern,
      confidence,
      frequency: acc.tf,
      documentFrequency: acc.df,
      occurrences,
    });
  }

  candidates.sort((a, b) => b.confidence - a.confidence);

  return {
    candidates,
    nlpSegmenterUsed: hasNlpPlugin ? "plugin" : "intl-fallback",
  };
};
