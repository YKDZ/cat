import { describe, it, expect } from "vitest";

import {
  extractEnDescription,
  extractEnInline,
  parseTSDoc,
} from "./tsdoc-parser.js";

describe("extractEnDescription", () => {
  it("extracts @en content from bilingual format", () => {
    const raw = "@zh 中文描述。\n@en English description.";
    expect(extractEnDescription(raw)).toBe("English description.");
  });

  it("returns undefined when only @zh tag is present", () => {
    const raw = "@zh 只有中文。";
    expect(extractEnDescription(raw)).toBeUndefined();
  });

  it("returns raw text for monolingual (no tags)", () => {
    const raw = "Plain English description.";
    expect(extractEnDescription(raw)).toBe("Plain English description.");
  });

  it("returns undefined for empty string", () => {
    expect(extractEnDescription("")).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(extractEnDescription(undefined)).toBeUndefined();
  });

  it("handles multi-line @en content", () => {
    const raw = "@zh 中文。\n@en First line.\nSecond line.";
    expect(extractEnDescription(raw)).toBe("First line.\nSecond line.");
  });

  it("stops @en at next block tag", () => {
    const raw = "@zh 中文。\n@en English.\n@param foo - bar";
    expect(extractEnDescription(raw)).toBe("English.");
  });
});

describe("extractEnInline", () => {
  it("extracts {@en ...} inline content", () => {
    const raw = "{@zh 语言代码} {@en BCP 47 language code}";
    expect(extractEnInline(raw)).toBe("BCP 47 language code");
  });

  it("returns undefined when only {@zh} is present", () => {
    const raw = "{@zh 中文内联}";
    expect(extractEnInline(raw)).toBeUndefined();
  });

  it("returns raw text for monolingual inline", () => {
    const raw = "Simple param description";
    expect(extractEnInline(raw)).toBe("Simple param description");
  });

  it("returns undefined for undefined input", () => {
    expect(extractEnInline(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(extractEnInline("")).toBeUndefined();
  });

  it("extracts {@en ...} with dash prefix (as in @returns -)", () => {
    const raw = "- {@zh 语言显示名称} {@en Display name of the language}";
    expect(extractEnInline(raw)).toBe("Display name of the language");
  });

  it("returns undefined for dash-prefixed {@zh} only", () => {
    const raw = "- {@zh 中文描述}";
    expect(extractEnInline(raw)).toBeUndefined();
  });
});

describe("parseTSDoc", () => {
  it("detects bilingual and extracts English", () => {
    const result = parseTSDoc("@zh 中文。\n@en English.");
    expect(result.isBilingual).toBe(true);
    expect(result.description).toBe("English.");
  });

  it("handles undefined input", () => {
    const result = parseTSDoc(undefined);
    expect(result.isBilingual).toBe(false);
    expect(result.description).toBeUndefined();
  });

  it("detects non-bilingual monolingual text", () => {
    const result = parseTSDoc("Plain text.");
    expect(result.isBilingual).toBe(false);
    expect(result.description).toBe("Plain text.");
  });
});
