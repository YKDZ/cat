import type { NlpToken } from "@cat/shared";

export const isCjkLanguage = (languageId: string): boolean => {
  const lang = languageId.split("-")[0]?.toLowerCase() ?? "";
  return ["zh", "ja", "ko"].includes(lang);
};

export const joinTokens = (tokens: NlpToken[], languageId: string): string => {
  const separator = isCjkLanguage(languageId) ? "" : " ";
  return tokens.map((token) => token.text).join(separator);
};

export const joinLemmas = (tokens: NlpToken[], languageId: string): string => {
  const separator = isCjkLanguage(languageId) ? "" : " ";
  return tokens.map((token) => token.lemma).join(separator);
};

export type TokenWindow = {
  surface: string;
  normalized: string;
  tokenCount: number;
  tokens: NlpToken[];
};

export const buildTokenWindows = (
  tokens: NlpToken[],
  languageId: string,
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
