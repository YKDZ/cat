import { describe, expect, it } from "vitest";

import { getGhostTextRemainder, shouldHandleGhostTextKey } from "./ghost-text";

describe("ghost text helpers", () => {
  it("continues showing only the suffix while the input is a prefix", () => {
    expect(
      getGhostTextRemainder(
        { suggestion: "你好，世界", anchorPosition: 0 },
        "你好",
        2,
      ),
    ).toBe("，世界");
  });

  it("hides ghost text when the input no longer matches the suggestion", () => {
    expect(
      getGhostTextRemainder(
        { suggestion: "你好，世界", anchorPosition: 0 },
        "拼音",
        2,
      ),
    ).toBeNull();
  });

  it("hides ghost text when the suggestion has already been fully typed", () => {
    expect(
      getGhostTextRemainder(
        { suggestion: "完成", anchorPosition: 0 },
        "完成",
        2,
      ),
    ).toBeNull();
  });

  it("does not handle ghost text shortcuts while an IME composition is active", () => {
    expect(shouldHandleGhostTextKey({ composing: true })).toBe(false);
    expect(shouldHandleGhostTextKey({ composing: false })).toBe(true);
  });
});
