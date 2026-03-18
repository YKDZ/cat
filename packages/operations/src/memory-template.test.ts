import type { Token } from "@cat/plugin-core";

import { describe, expect, it } from "vitest";

import {
  fillTemplate,
  mappingToSlots,
  placeholderize,
  slotsToMapping,
} from "./memory-template";

// ─── helpers ─────────────────────────────────────────────────────────────────

const makeToken = (
  type: Token["type"],
  value: string,
  start: number,
  end: number,
  children?: Token[],
): Token => ({ type, value, start, end, children });

// ─── placeholderize ───────────────────────────────────────────────────────────

describe("placeholderize", () => {
  it("should return original text unchanged for plain-text tokens", () => {
    const tokens: Token[] = [makeToken("text", "Hello world", 0, 11)];
    const result = placeholderize(tokens, "Hello world");
    expect(result.template).toBe("Hello world");
    expect(result.slots).toHaveLength(0);
  });

  it("should replace a number token with {NUM_0}", () => {
    const text = "Error 404";
    const tokens: Token[] = [
      makeToken("text", "Error ", 0, 6),
      makeToken("number", "404", 6, 9),
    ];
    const result = placeholderize(tokens, text);
    expect(result.template).toBe("Error {NUM_0}");
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0]?.placeholder).toBe("{NUM_0}");
    expect(result.slots[0]?.originalValue).toBe("404");
    expect(result.slots[0]?.tokenType).toBe("number");
    expect(result.slots[0]?.start).toBe(6);
    expect(result.slots[0]?.end).toBe(9);
  });

  it("should increment the counter per placeholder type", () => {
    const text = "1 and 2";
    const tokens: Token[] = [
      makeToken("number", "1", 0, 1),
      makeToken("text", " and ", 1, 6),
      makeToken("number", "2", 6, 7),
    ];
    const result = placeholderize(tokens, text);
    expect(result.template).toBe("{NUM_0} and {NUM_1}");
    expect(result.slots).toHaveLength(2);
    expect(result.slots[0]?.placeholder).toBe("{NUM_0}");
    expect(result.slots[1]?.placeholder).toBe("{NUM_1}");
  });

  it("should use independent counters for different placeholder types", () => {
    const text = "var x = 1";
    const tokens: Token[] = [
      makeToken("variable", "x", 4, 5),
      makeToken("text", " = ", 5, 8),
      makeToken("number", "1", 8, 9),
    ];
    const result = placeholderize(tokens, text);
    expect(result.template).toBe("var {VAR_0} = {NUM_0}");
    expect(result.slots).toHaveLength(2);
  });

  it("should preserve whitespace, space and newline tokens unchanged", () => {
    const text = " hello ";
    const tokens: Token[] = [
      makeToken("whitespace", " ", 0, 1),
      makeToken("text", "hello", 1, 6),
      makeToken("whitespace", " ", 6, 7),
    ];
    const result = placeholderize(tokens, text);
    expect(result.template).toBe(" hello ");
    expect(result.slots).toHaveLength(0);
  });

  it("should fill gaps in the text between tokens", () => {
    // Token only covers "404"; gap "Error " before it should be filled from originalText
    const text = "Error 404";
    const tokens: Token[] = [makeToken("number", "404", 6, 9)];
    const result = placeholderize(tokens, text);
    expect(result.template).toBe("Error {NUM_0}");
  });

  it("should append trailing text after the last token", () => {
    const text = "Error 404!";
    const tokens: Token[] = [
      makeToken("text", "Error ", 0, 6),
      makeToken("number", "404", 6, 9),
    ];
    const result = placeholderize(tokens, text);
    expect(result.template).toBe("Error {NUM_0}!");
  });

  it("should recurse into parent token children instead of replacing the parent", () => {
    const text = "1";
    const child = makeToken("number", "1", 0, 1);
    const parent = makeToken("text", "1", 0, 1, [child]);
    const result = placeholderize([parent], text);
    // parent type is "text" but it has children — children are processed
    expect(result.template).toBe("{NUM_0}");
    expect(result.slots).toHaveLength(1);
  });

  it("should handle an empty token list", () => {
    const text = "plain";
    const result = placeholderize([], text);
    expect(result.template).toBe("plain");
    expect(result.slots).toHaveLength(0);
  });
});

// ─── fillTemplate ─────────────────────────────────────────────────────────────

describe("fillTemplate", () => {
  it("should return the translation unchanged when there are no placeholders", () => {
    const result = fillTemplate("Hello world", [], []);
    expect(result).toBe("Hello world");
  });

  it("should fill a placeholder from the source slot", () => {
    const translationSlots = [
      {
        placeholder: "{NUM_0}",
        originalValue: "100",
        tokenType: "number" as const,
        start: 0,
        end: 3,
      },
    ];
    const sourceSlots = [
      {
        placeholder: "{NUM_0}",
        originalValue: "200",
        tokenType: "number" as const,
        start: 0,
        end: 3,
      },
    ];
    const result = fillTemplate("共 {NUM_0} 个", translationSlots, sourceSlots);
    expect(result).toBe("共 200 个");
  });

  it("should fall back to the stored translation value when the source slot is missing", () => {
    const translationSlots = [
      {
        placeholder: "{NUM_0}",
        originalValue: "100",
        tokenType: "number" as const,
        start: 0,
        end: 3,
      },
    ];
    const result = fillTemplate("共 {NUM_0} 个", translationSlots, []);
    expect(result).toBe("共 100 个");
  });

  it("should return null when a placeholder cannot be resolved from either source", () => {
    const result = fillTemplate("{UNKNOWN_0} items", [], []);
    expect(result).toBeNull();
  });

  it("should replace multiple different placeholders in one template", () => {
    const translationSlots = [
      {
        placeholder: "{NUM_0}",
        originalValue: "1",
        tokenType: "number" as const,
        start: 0,
        end: 1,
      },
      {
        placeholder: "{VAR_0}",
        originalValue: "x",
        tokenType: "variable" as const,
        start: 2,
        end: 3,
      },
    ];
    const sourceSlots = [
      {
        placeholder: "{NUM_0}",
        originalValue: "99",
        tokenType: "number" as const,
        start: 0,
        end: 2,
      },
      {
        placeholder: "{VAR_0}",
        originalValue: "counter",
        tokenType: "variable" as const,
        start: 3,
        end: 10,
      },
    ];
    const result = fillTemplate(
      "{VAR_0} = {NUM_0}",
      translationSlots,
      sourceSlots,
    );
    expect(result).toBe("counter = 99");
  });
});

// ─── slotsToMapping / mappingToSlots ─────────────────────────────────────────

describe("slotsToMapping", () => {
  it("should convert slots to serializable mapping entries", () => {
    const slots = [
      {
        placeholder: "{NUM_0}",
        originalValue: "42",
        tokenType: "number" as const,
        start: 5,
        end: 7,
      },
    ];
    const mapping = slotsToMapping(slots);
    expect(mapping).toHaveLength(1);
    expect(mapping[0]).toEqual({
      placeholder: "{NUM_0}",
      value: "42",
      tokenType: "number",
    });
  });

  it("should return an empty array for an empty slots list", () => {
    expect(slotsToMapping([])).toEqual([]);
  });
});

describe("mappingToSlots", () => {
  it("should restore placeholder and value; start/end are set to 0", () => {
    const mapping = [
      { placeholder: "{NUM_0}", value: "42", tokenType: "number" as const },
    ];
    const slots = mappingToSlots(mapping);
    expect(slots).toHaveLength(1);
    expect(slots[0]?.placeholder).toBe("{NUM_0}");
    expect(slots[0]?.originalValue).toBe("42");
    expect(slots[0]?.tokenType).toBe("number");
    expect(slots[0]?.start).toBe(0);
    expect(slots[0]?.end).toBe(0);
  });

  it("should return an empty array for an empty mapping", () => {
    expect(mappingToSlots([])).toEqual([]);
  });
});
