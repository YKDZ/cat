import { z } from "zod";

/**
 * ASCII helpers
 */
const isAsciiLower = (cp: number) => cp >= 0x61 && cp <= 0x7a;
const isAsciiUpper = (cp: number) => cp >= 0x41 && cp <= 0x5a;
const isAsciiAlpha = (cp: number) =>
  (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a);
const isAsciiDigit = (cp: number) => cp >= 0x30 && cp <= 0x39;
const isAsciiWhitespace = (cp: number) =>
  cp === 0x09 || cp === 0x0a || cp === 0x0c || cp === 0x0d || cp === 0x20;

const isExtendedChar = (cp: number) => cp >= 0x80 && cp <= 0x10ffff;

/**
 * Valid element local name (WHATWG)
 */
const isValidLocalName = (name: string) => {
  if (name.length === 0) return false;

  const cps = Array.from(name, (c) => c.codePointAt(0)!);
  const first = cps[0];

  // If first code point is ASCII letter
  if (isAsciiAlpha(first)) {
    for (const cp of cps) {
      if (
        isAsciiWhitespace(cp) ||
        cp === 0x0000 || // NULL
        cp === 0x002f || // /
        cp === 0x003e // >
      ) {
        return false;
      }
    }
    return true;
  }

  // Otherwise, first must be :, _, or >= U+0080
  if (
    first !== 0x003a && // :
    first !== 0x005f && // _
    !isExtendedChar(first)
  ) {
    return false;
  }

  // Following code points
  for (let i = 1; i < cps.length; i += 1) {
    const cp = cps[i];
    if (
      isAsciiAlpha(cp) ||
      isAsciiDigit(cp) ||
      cp === 0x002d || // -
      cp === 0x002e || // .
      cp === 0x003a || // :
      cp === 0x005f || // _
      isExtendedChar(cp)
    ) {
      continue;
    }
    return false;
  }

  return true;
};

/**
 * Custom Element reserved names
 */
const RESERVED_CUSTOM_ELEMENT_NAMES = new Set([
  "annotation-xml",
  "color-profile",
  "font-face",
  "font-face-src",
  "font-face-uri",
  "font-face-format",
  "font-face-name",
  "missing-glyph",
]);

/**
 * Custom Element Name Schema
 * @see https://html.spec.whatwg.org/multipage/custom-elements.html#valid-custom-element-name
 */
export const CustomElementNameSchema = z
  .string()
  .refine((name) => isValidLocalName(name), "Not a valid element local name")
  .refine((name) => {
    const firstCp = name.codePointAt(0)!;
    return isAsciiLower(firstCp);
  }, "Custom element name must start with an ASCII lowercase letter")
  .refine(
    (name) => !Array.from(name, (c) => c.codePointAt(0)!).some(isAsciiUpper),
    "Custom element name must not contain ASCII uppercase letters",
  )
  .refine(
    (name) => name.includes("-"),
    "Custom element name must contain a hyphen (-)",
  )
  .refine(
    (name) => !RESERVED_CUSTOM_ELEMENT_NAMES.has(name),
    "Name is reserved by SVG or MathML",
  );
