/**
 * @module memory-template
 *
 * Placeholder abstraction utilities for the template memory system.
 *
 * Uses the existing {@link Tokenizer} plugin system to parse text into tokens,
 * then replaces all non-text/non-whitespace tokens with typed placeholders
 * (e.g. `{NUM_0}`, `{VAR_0}`, `{LINK_0}`).
 *
 * This enables template-based memory matching: two texts with the same template
 * but different token values can be matched deterministically, with the token
 * values swapped in the translation.
 */
import type { Token } from "@cat/plugin-core";
import type { TokenType } from "@cat/shared/schema/drizzle/enum";

// Token types that should NOT be replaced by placeholders
const PRESERVED_TOKEN_TYPES: ReadonlySet<TokenType> = new Set([
  "text",
  "unknown",
  "whitespace",
  "newline",
  "space",
]);

// Prefix mapping for placeholder names
const TOKEN_TYPE_PREFIX: Record<string, string> = {
  number: "NUM",
  variable: "VAR",
  link: "LINK",
  term: "TERM",
  mask: "MASK",
};

export interface PlaceholderSlot {
  /** Placeholder string, e.g. "{NUM_0}" */
  placeholder: string;
  /** Original value from the source text */
  originalValue: string;
  /** Token type that this placeholder replaces */
  tokenType: TokenType;
  /** Start offset in the original text */
  start: number;
  /** End offset in the original text */
  end: number;
}

export interface PlaceholderResult {
  /** Template string with placeholders, e.g. "Error Code: {NUM_0}" */
  template: string;
  /** Ordered list of placeholder-value mappings */
  slots: PlaceholderSlot[];
}

/**
 * Convert a flat token sequence into a placeholder template.
 *
 * All token types except `text`, `unknown`, and whitespace-like types
 * are replaced with `{TYPE_N}` placeholders where N is a per-type counter.
 *
 * @param tokens - Flat token array from `tokenize()` / `tokenizeOp()`
 * @param originalText - The original text (used for offset extraction)
 * @returns Template string and slot mappings
 */
export const placeholderize = (
  tokens: Token[],
  originalText: string,
): PlaceholderResult => {
  const slots: PlaceholderSlot[] = [];
  const typeCounters = new Map<string, number>();
  let template = "";
  let lastEnd = 0;

  /**
   * Recursively process tokens. Leaf tokens (no children) with replaceable
   * types get substituted; parent tokens delegate to their children.
   */
  const processTokens = (tokenList: Token[]) => {
    for (const token of tokenList) {
      // Fill any gap between last processed position and this token's start
      if (token.start > lastEnd) {
        template += originalText.slice(lastEnd, token.start);
      }

      if (
        !PRESERVED_TOKEN_TYPES.has(token.type) &&
        (!token.children || token.children.length === 0)
      ) {
        // Replaceable leaf token → create placeholder
        const prefix =
          TOKEN_TYPE_PREFIX[token.type] ?? token.type.toUpperCase();
        const count = typeCounters.get(prefix) ?? 0;
        typeCounters.set(prefix, count + 1);

        const placeholder = `{${prefix}_${count}}`;

        slots.push({
          placeholder,
          originalValue: token.value,
          tokenType: token.type,
          start: token.start,
          end: token.end,
        });

        template += placeholder;
        lastEnd = token.end;
      } else if (token.children && token.children.length > 0) {
        // Parent token with children → recurse
        processTokens(token.children);
      } else {
        // Preserved token type → keep original text
        template += token.value;
        lastEnd = token.end;
      }
    }
  };

  processTokens(tokens);

  // Append any trailing text after the last token
  if (lastEnd < originalText.length) {
    template += originalText.slice(lastEnd);
  }

  return { template, slots };
};

/**
 * Attempt to fill a translation template with values from a source mapping.
 *
 * Given:
 * - A translation template (e.g. "错误码：{NUM_0}")
 * - Translation slots from the stored memory
 * - Source slots from the current input text
 *
 * This replaces each placeholder in the translation template with the
 * corresponding value from the current source text's slots (matched by
 * placeholder name), falling back to the stored translation's original value.
 *
 * @returns The filled translation string, or null if slots are incompatible.
 */
export const fillTemplate = (
  translationTemplate: string,
  translationSlots: PlaceholderSlot[],
  sourceSlots: PlaceholderSlot[],
): string | null => {
  // Build a map from placeholder name → new value (from source slots)
  const sourceMap = new Map<string, string>();
  for (const slot of sourceSlots) {
    sourceMap.set(slot.placeholder, slot.originalValue);
  }

  // Build a map from placeholder name → original value (from translation slots)
  const translationMap = new Map<string, string>();
  for (const slot of translationSlots) {
    translationMap.set(slot.placeholder, slot.originalValue);
  }

  let result = translationTemplate;

  // Replace all placeholders. We must check that every placeholder in the
  // translation template has a corresponding source value.
  const placeholderRegex = /\{[A-Z]+_\d+\}/g;
  const placeholders = translationTemplate.match(placeholderRegex);

  if (!placeholders) {
    // No placeholders in translation template — return as-is
    return translationTemplate;
  }

  for (const ph of placeholders) {
    const newValue = sourceMap.get(ph);
    if (newValue !== undefined) {
      result = result.replace(ph, newValue);
    } else {
      // Placeholder exists in translation but not in source — incompatible
      // Fall back to stored translation value if available
      const fallback = translationMap.get(ph);
      if (fallback !== undefined) {
        result = result.replace(ph, fallback);
      } else {
        return null; // Cannot fill this placeholder
      }
    }
  }

  return result;
};

/**
 * JSON-serializable slot mapping for database storage.
 */
export interface SlotMappingEntry {
  placeholder: string;
  value: string;
  tokenType: TokenType;
}

/**
 * Convert PlaceholderSlots to a serializable mapping for DB storage.
 */
export const slotsToMapping = (
  slots: PlaceholderSlot[],
): SlotMappingEntry[] => {
  return slots.map((s) => ({
    placeholder: s.placeholder,
    value: s.originalValue,
    tokenType: s.tokenType,
  }));
};

/**
 * Convert a stored slot mapping back to PlaceholderSlots.
 * Note: start/end offsets are not preserved in storage,
 * they are only needed at placeholderize time.
 */
export const mappingToSlots = (
  mapping: SlotMappingEntry[],
): PlaceholderSlot[] => {
  return mapping.map((m) => ({
    placeholder: m.placeholder,
    originalValue: m.value,
    tokenType: m.tokenType,
    start: 0,
    end: 0,
  }));
};
