import type { LanguageAnalysisToken, NormalizedLanguageId } from "@cat/shared";

/**
 * Language analyzers may omit lemmas for languages whose token surface is
 * already the canonical recall unit. Consumers must retain that surface.
 */
export const normalizeTokenLemma = (
  token: Pick<LanguageAnalysisToken, "text" | "lemma">,
): string => (token.lemma.trim().length > 0 ? token.lemma : token.text);

export const isCjkLanguage = (languageId: NormalizedLanguageId): boolean => {
  const lang = languageId.split("-")[0]?.toLowerCase() ?? "";
  return ["zh", "ja", "ko"].includes(lang);
};

export const joinTokens = (
  tokens: LanguageAnalysisToken[],
  languageId: NormalizedLanguageId,
): string => {
  const separator = isCjkLanguage(languageId) ? "" : " ";
  return tokens.map((token) => token.text).join(separator);
};

export const joinLemmas = (
  tokens: LanguageAnalysisToken[],
  languageId: NormalizedLanguageId,
): string => {
  const separator = isCjkLanguage(languageId) ? "" : " ";
  return tokens.map(normalizeTokenLemma).join(separator);
};

export type TokenWindow = {
  surface: string;
  normalized: string;
  tokenCount: number;
  tokens: LanguageAnalysisToken[];
};

export const buildTokenWindows = (
  tokens: LanguageAnalysisToken[],
  languageId: NormalizedLanguageId,
  maxWindowSize = tokens.length,
): TokenWindow[] => {
  if (tokens.length === 0) return [];

  const windows: TokenWindow[] = [];
  const limit = Math.min(maxWindowSize, tokens.length);

  for (let windowSize = 1; windowSize <= limit; windowSize += 1) {
    for (let start = 0; start <= tokens.length - windowSize; start += 1) {
      const slice = tokens.slice(start, start + windowSize);
      windows.push({
        surface: joinTokens(slice, languageId),
        normalized: joinLemmas(slice, languageId),
        tokenCount: slice.length,
        tokens: slice,
      });
    }
  }

  return windows;
};
