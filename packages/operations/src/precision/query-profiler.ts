// packages/operations/src/precision/query-profiler.ts
import type { QueryProfile } from "@cat/shared";

/**
 * Extract a QueryProfile from the raw query text.
 *
 * Rules:
 * - tokenCount   = word-boundary split on Unicode letters/digits (\p{L}|\p{N})+
 * - contentWordDensity = tokens that are not pure-stop-words and not pure punct
 * - isShortQuery  = tokenCount <= 3 AND contentWordDensity >= 0.5
 * - hasNumericAnchor = any token matches /^\d[\d.,]*$/
 * - hasPlaceholderAnchor = any token matches %s / %d / {N} / {WORD} patterns
 * - isTemplateLike = hasPlaceholderAnchor OR (isShortQuery AND hasNumericAnchor)
 * - hasEntityWord  = any token with 2+ consecutive uppercase letters OR CamelCase ≥6 chars
 */
export function profileQuery(text: string): QueryProfile {
  const rawTokens = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const tokenCount = rawTokens.length;

  const COMMON_STOPS = new Set([
    "a",
    "an",
    "the",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "to",
    "of",
    "in",
    "on",
    "at",
    "by",
    "for",
    "with",
    "and",
    "or",
    "but",
    "not",
    "no",
    "it",
    "its",
    "this",
    "that",
    "as",
    "do",
    "have",
    "has",
    "from",
    "up",
    "out",
    "so",
  ]);

  const contentTokens = rawTokens.filter(
    (t) => !COMMON_STOPS.has(t.toLowerCase()) && t.length > 1,
  );
  const contentWordDensity =
    tokenCount > 0 ? contentTokens.length / tokenCount : 0;

  const hasNumericAnchor = rawTokens.some((t) => /^\d[\d.,]*$/.test(t));

  const hasPlaceholderAnchor = /(%[sd]|\{[^}]+\}|\$[a-zA-Z_]\w*)/.test(text);

  const isShortQuery = tokenCount <= 3 && contentWordDensity >= 0.5;

  const isTemplateLike =
    hasPlaceholderAnchor || (isShortQuery && hasNumericAnchor);

  const hasEntityWord = rawTokens.some(
    (t) =>
      /[A-Z]{2,}/.test(t) || // ALL_CAPS abbreviation
      (/[A-Z][a-z]/.test(t) && t.length >= 6), // CamelCase ≥6
  );

  return {
    tokenCount,
    contentWordDensity,
    hasNumericAnchor,
    hasPlaceholderAnchor,
    isTemplateLike,
    isShortQuery,
    hasEntityWord,
  };
}
