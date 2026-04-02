/**
 * Bilingual TSDoc parser.
 *
 * Extracts @en (English) content from JSDoc comments that use the
 * bilingual @zh/@en block-tag convention defined in .claude/rules/tsdoc.md.
 * Falls back to raw text when no bilingual tags are present.
 */

/** Result of parsing a bilingual JSDoc comment. */
export interface ParsedTSDoc {
  /** The extracted English description, or the raw fallback text. */
  description: string | undefined;
  /** Whether the source contained bilingual @zh/@en tags. */
  isBilingual: boolean;
}

/**
 * Extract the @en block content from a JSDoc description string.
 *
 * Block-tag format (per tsdoc.md):
 *   @zh 中文描述。
 *   @en English description.
 *
 * The @en block extends until the next recognized block tag or end of text.
 */
export const extractEnDescription = (
  raw: string | undefined,
): string | undefined => {
  if (!raw) return undefined;

  const enBlockRe = /@en\s+([\s\S]*?)(?=@\w+\s|$)/;
  const match = raw.match(enBlockRe);
  if (match?.[1]) {
    return match[1].trim();
  }

  // No @en tag found — check if @zh is present (partially bilingual);
  // if neither tag exists, return the raw text as-is (monolingual fallback).
  if (raw.includes("@zh")) {
    // Has @zh but no @en — return undefined to signal missing English
    return undefined;
  }

  return raw.trim() || undefined;
};

/**
 * Extract the {@en ...} inline-tag content from a @param or @returns string.
 *
 * Inline format (per tsdoc.md):
 *   @param code - {@zh 语言代码} {@en BCP 47 language code}
 *   @returns - {@zh 语言显示名称} {@en Display name of the language}
 */
export const extractEnInline = (
  raw: string | undefined,
): string | undefined => {
  if (!raw) return undefined;

  const inlineRe = /\{@en\s+([^}]+)\}/;
  const match = raw.match(inlineRe);
  if (match?.[1]) {
    return match[1].trim();
  }

  // No {@en} inline tag — check for {@zh} (partially bilingual)
  if (raw.includes("{@zh")) {
    return undefined;
  }

  return raw.trim() || undefined;
};

/**
 * Parse a full JSDoc comment text and extract the English description.
 */
export const parseTSDoc = (raw: string | undefined): ParsedTSDoc => {
  if (!raw) return { description: undefined, isBilingual: false };

  const isBilingual = /@(?:zh|en)\s/.test(raw) || /\{@(?:zh|en)\s/.test(raw);
  const description = extractEnDescription(raw);

  return { description, isBilingual };
};
