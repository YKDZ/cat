import type { TermData } from "@cat/shared/schema/misc";

import { describe, expect, it } from "vitest";

import type { ParseResult, ParserContext } from "@/services/tokenizer.ts";

import { Tokenizer, TokenizerPriority } from "@/services/tokenizer.ts";
import { parseInner, tokenize } from "@/utils/tokenizer.ts";

// ─── Stub tokenizers ──────────────────────────────────────────────────────────

/** Matches `{{...}}` style variable placeholders synchronously. */
class VarTokenizer extends Tokenizer {
  getId() {
    return "var";
  }
  getPriority() {
    return TokenizerPriority.VARIABLE;
  }
  parse(ctx: ParserContext): ParseResult | undefined {
    const slice = ctx.source.slice(ctx.cursor);
    const m = /^\{\{([^}]+)\}\}/.exec(slice);
    if (!m) return undefined;
    return {
      token: {
        type: "variable",
        value: m[0],
        start: ctx.cursor,
        end: ctx.cursor + m[0].length,
        meta: { name: m[1] },
      },
    };
  }
}

/** Matches `[label](url)` style links asynchronously. */
class LinkTokenizer extends Tokenizer {
  getId() {
    return "link";
  }
  getPriority() {
    return TokenizerPriority.LITERAL;
  }
  async parse(ctx: ParserContext): Promise<ParseResult | undefined> {
    const slice = ctx.source.slice(ctx.cursor);
    const m = /^\[([^\]]+)\]\(([^)]+)\)/.exec(slice);
    if (!m) return undefined;
    return {
      token: {
        type: "link",
        value: m[0],
        start: ctx.cursor,
        end: ctx.cursor + m[0].length,
        meta: { label: m[1], url: m[2] },
      },
    };
  }
}

const varRule = { rule: new VarTokenizer(), id: 1 };
const linkRule = { rule: new LinkTokenizer(), id: 2 };

// ─── tokenize ─────────────────────────────────────────────────────────────────

describe("tokenize", () => {
  it("returns a single text token when no rule matches", async () => {
    const tokens = await tokenize("hello", []);
    // consecutive unmatched chars are merged into one growing text token
    expect(tokens).toHaveLength(1);
    const last = tokens[0];
    expect(last?.type).toBe("text");
    expect(last?.value).toBe("hello");
    expect(last?.start).toBe(0);
    expect(last?.end).toBe(5);
  });

  it("merges consecutive unmatched chars into one text token", async () => {
    const tokens = await tokenize("abc", []);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      type: "text",
      value: "abc",
      start: 0,
      end: 3,
    });
  });

  it("matches a variable token between text", async () => {
    const tokens = await tokenize("Hello {{name}}!", [varRule]);
    expect(tokens).toHaveLength(3);
    expect(tokens[0]).toMatchObject({ type: "text", value: "Hello " });
    expect(tokens[1]).toMatchObject({
      type: "variable",
      value: "{{name}}",
      start: 6,
      end: 14,
      ruleId: 1,
    });
    expect(tokens[2]).toMatchObject({ type: "text", value: "!" });
  });

  it("sets meta.matchedRuleId on matched tokens", async () => {
    const tokens = await tokenize("{{x}}", [varRule]);
    expect(tokens[0]?.meta?.matchedRuleId).toBe(1);
  });

  it("handles async tokenizer (LinkTokenizer)", async () => {
    const tokens = await tokenize("See [click](http://a.com) now", [linkRule]);
    expect(tokens).toHaveLength(3);
    expect(tokens[1]).toMatchObject({
      type: "link",
      value: "[click](http://a.com)",
      start: 4,
      end: 25,
    });
  });

  it("tries rules in order and uses the first match", async () => {
    // Both rules provided; varRule has higher priority and comes first in array.
    const tokens = await tokenize("{{name}}", [varRule, linkRule]);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.type).toBe("variable");
    expect(tokens[0]?.ruleId).toBe(1);
  });

  it("falls back to second rule when first does not match", async () => {
    // linkRule second but varRule won't match a link pattern
    const tokens = await tokenize("[lbl](http://x.com)", [varRule, linkRule]);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.type).toBe("link");
    expect(tokens[0]?.ruleId).toBe(2);
  });

  it("produces correct start/end for each token in multi-token text", async () => {
    const tokens = await tokenize("a{{b}}c", [varRule]);
    expect(tokens[0]).toMatchObject({ start: 0, end: 1 });
    expect(tokens[1]).toMatchObject({ start: 1, end: 6 });
    expect(tokens[2]).toMatchObject({ start: 6, end: 7 });
  });

  it("returns empty array for empty input", async () => {
    const tokens = await tokenize("", [varRule]);
    expect(tokens).toHaveLength(0);
  });

  it("passes terms option through to the tokenizer context", async () => {
    let capturedCtx: ParserContext | undefined;
    class SpyTokenizer extends Tokenizer {
      getId() {
        return "spy";
      }
      getPriority() {
        return TokenizerPriority.LOWEST;
      }
      parse(ctx: ParserContext): ParseResult | undefined {
        capturedCtx = ctx;
        return undefined;
      }
    }
    const spy = { rule: new SpyTokenizer(), id: 99 };
    const terms: TermData[] = [];
    await tokenize("x", [spy], { terms });
    expect(capturedCtx?.terms).toBe(terms);
  });
});

// ─── parseInner ──────────────────────────────────────────────────────────────

describe("parseInner", () => {
  it("shifts token positions by offsetInParent", async () => {
    // "{{x}}" starts at offset 10 in parent
    const tokens = await parseInner("{{x}}", 10, [varRule]);
    expect(tokens[0]).toMatchObject({ start: 10, end: 15 });
  });

  it("zero offset leaves positions unchanged", async () => {
    const tokens = await parseInner("ab", 0, []);
    // 'a' at 0-1, 'b' merged → 'ab' at 0-2
    const merged = tokens[tokens.length - 1];
    expect(merged?.start).toBe(0);
    expect(merged?.end).toBe(2);
  });

  it("shifts children recursively", async () => {
    // Build a tokenizer that returns a token with children
    class ParentTokenizer extends Tokenizer {
      getId() {
        return "parent";
      }
      getPriority() {
        return TokenizerPriority.STRUCTURE;
      }
      parse(ctx: ParserContext): ParseResult | undefined {
        if (ctx.source[ctx.cursor] !== "[") return undefined;
        return {
          token: {
            type: "variable",
            value: "[x]",
            start: ctx.cursor,
            end: ctx.cursor + 3,
            children: [
              {
                type: "text",
                value: "x",
                start: ctx.cursor + 1,
                end: ctx.cursor + 2,
              },
            ],
          },
        };
      }
    }
    const parent = { rule: new ParentTokenizer(), id: 10 };
    const offset = 5;
    const tokens = await parseInner("[x]", offset, [parent]);
    expect(tokens[0]).toMatchObject({ start: 5, end: 8 });
    expect(tokens[0]?.children?.[0]).toMatchObject({ start: 6, end: 7 });
  });
});
