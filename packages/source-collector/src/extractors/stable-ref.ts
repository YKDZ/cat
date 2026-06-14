import { createHash } from "node:crypto";

/**
 * Input required to build a stable source reference.
 */
export type StableSourceRefInput = {
  /** Extractor ID. */
  extractorId: string;
  /** Relative source file path. */
  filePath: string;
  /** Section inside the file. */
  section: string;
  /** Syntax anchor excluding source line number and source text. */
  anchorPath: string;
  /** Call kind. */
  callKind?: string;
  /** Call ordinal within the same anchor. */
  ordinal: number;
};

/**
 * Normalize i18n text for stable references and locale matching.
 *
 * @param text - Raw text
 * @returns - Normalized text
 */
export const normalizeI18nText = (text: string): string => {
  return text.normalize("NFC").trim().replace(/\s+/g, " ");
};

const shortHash = (value: string): string => {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
};

/**
 * Build a source text fingerprint for diagnostics and meta only, not stable identity.
 *
 * @param text - Raw text
 * @returns - Short text fingerprint
 */
export const buildTextFingerprint = (text: string): string => {
  return shortHash(normalizeI18nText(text));
};

/**
 * Build a stable element reference that does not depend on source line numbers.
 *
 * @param input - Stable reference input
 * @returns - Stable source reference
 */
export const buildStableSourceRef = (input: StableSourceRefInput): string => {
  const callKind = input.callKind ?? "call";
  const fingerprint = shortHash(
    [
      input.extractorId,
      input.filePath,
      input.section,
      input.anchorPath,
      callKind,
      String(input.ordinal),
    ].join("\u0000"),
  );

  return `${input.extractorId}:${input.filePath}:${input.section}:${input.anchorPath}:${callKind}:#${input.ordinal}:${fingerprint}`;
};
