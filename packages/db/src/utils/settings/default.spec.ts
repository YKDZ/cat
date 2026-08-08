import { describe, expect, it } from "vitest";

import { resolveDefaultDisplayLanguage } from "./default.ts";

describe("resolveDefaultDisplayLanguage", () => {
  it.each([
    ["zh_cn", "zh_cn"],
    ["en_us", "en_us"],
    ["../../secret", "zh_cn"],
    [undefined, "zh_cn"],
  ])("maps %s to %s", (input, expected) => {
    expect(resolveDefaultDisplayLanguage(input)).toBe(expected);
  });
});
