import type { NlpSegmentResult, NlpSentence, NlpToken } from "@cat/shared";

/**
 * 基础英文停用词列表（用于 Intl.Segmenter 回退模式）
 *
 * 仅包含最常见的功能词，不依赖外部数据源。
 * 当使用 NLP_WORD_SEGMENTER 插件时，停用词判断由 NLP 模型负责。
 */
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "as",
  "is",
  "was",
  "are",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "need",
  "dare",
  "ought",
  "used",
  "this",
  "that",
  "these",
  "those",
  "i",
  "me",
  "my",
  "myself",
  "we",
  "our",
  "ours",
  "ourselves",
  "you",
  "your",
  "yours",
  "yourself",
  "yourselves",
  "he",
  "him",
  "his",
  "himself",
  "she",
  "her",
  "hers",
  "herself",
  "it",
  "its",
  "itself",
  "they",
  "them",
  "their",
  "theirs",
  "themselves",
  "what",
  "which",
  "who",
  "whom",
  "whose",
  "not",
  "no",
  "nor",
  "so",
  "yet",
  "both",
  "either",
  "neither",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "than",
  "then",
  "too",
  "very",
  "s",
  "just",
  "also",
  "up",
  "out",
  "about",
  "into",
  "through",
]);

/**
 * 基于启发式规则推断基础 POS 标签（Universal POS Tag 子集）
 *
 * 由于 Intl.Segmenter 不提供词性信息，使用简单规则近似：
 * - 纯数字 → NUM
 * - 标点 → PUNCT
 * - 一般词汇 → X（unknown，因无法准确判断）
 *
 * 当使用 NLP_WORD_SEGMENTER 插件时，POS 由 NLP 模型提供。
 */
const inferBasicPos = (segment: Intl.SegmentData): string => {
  if (!segment.isWordLike) return "PUNCT";
  if (/^\d+([.,]\d+)*$/.test(segment.segment)) return "NUM";
  return "X";
};

const isPunctuation = (text: string): boolean => /^\p{P}+$/u.test(text);

/**
 * @zh 基于 Intl.Segmenter 的内嵌回退分词实现。
 *
 * 在没有可用的 NLP_WORD_SEGMENTER 插件时自动调用。
 * 局限性：无 POS 标注（pos 设为 "X" 或 "PUNCT"/"NUM"）、无 lemma（lemma 等于 text 的小写形式）、
 * 停用词仅覆盖基础英文词汇。
 * @en Built-in fallback segmentation based on Intl.Segmenter.
 *
 * Called automatically when no NLP_WORD_SEGMENTER plugin is available.
 * Limitations: no POS tagging (pos set to "X" or "PUNCT"/"NUM"), no
 * lemmatization (lemma equals the lowercased text), and stop-word
 * coverage is limited to basic English vocabulary.
 *
 * @param text - {@zh 要分词的文本} {@en Text to segment}
 * @param languageId - {@zh BCP 47 语言标识符，用于调整 Intl.Segmenter 行为} {@en BCP 47 language identifier used to configure Intl.Segmenter}
 * @returns - {@zh 包含句子和 token 列表的分词结果} {@en Segmentation result containing sentence and token lists}
 */
export const intlSegmenterFallback = (
  text: string,
  languageId: string,
): NlpSegmentResult => {
  const wordSegmenter = new Intl.Segmenter(languageId, { granularity: "word" });
  const wordSegments = [...wordSegmenter.segment(text)];

  const tokens: NlpToken[] = wordSegments
    .filter((seg) => seg.isWordLike || isPunctuation(seg.segment))
    .map((seg) => ({
      text: seg.segment,
      lemma: seg.segment.toLowerCase(),
      pos: inferBasicPos(seg),
      start: seg.index,
      end: seg.index + seg.segment.length,
      isStop: STOP_WORDS.has(seg.segment.toLowerCase()),
      isPunct: !seg.isWordLike,
    }));

  const sentenceSegmenter = new Intl.Segmenter(languageId, {
    granularity: "sentence",
  });
  const sentenceSegments = [...sentenceSegmenter.segment(text)];

  const sentences: NlpSentence[] = sentenceSegments.map((seg) => ({
    text: seg.segment,
    start: seg.index,
    end: seg.index + seg.segment.length,
    tokens: tokens.filter(
      (t) => t.start >= seg.index && t.end <= seg.index + seg.segment.length,
    ),
  }));

  return { sentences, tokens };
};
