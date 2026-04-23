import { describe, expect, it } from "vitest";

import { profileQuery } from "./query-profiler";

describe("profileQuery", () => {
  it("marks a 2-word entity query as short + entity", () => {
    const p = profileQuery("Zombie Head");
    expect(p.isShortQuery).toBe(true);
    expect(p.hasEntityWord).toBe(true);
    expect(p.hasNumericAnchor).toBe(false);
  });

  it("marks a template sentence", () => {
    const p = profileQuery("Press Enter to switch to %s");
    expect(p.hasPlaceholderAnchor).toBe(true);
    expect(p.isTemplateLike).toBe(true);
  });

  it("marks a numeric anchor", () => {
    const p = profileQuery("Order 42 completed");
    expect(p.hasNumericAnchor).toBe(true);
  });

  it("returns zero content density for stop-word-only text", () => {
    const p = profileQuery("a an the");
    expect(p.contentWordDensity).toBe(0);
  });

  it("does not crash on empty string", () => {
    const p = profileQuery("");
    expect(p.tokenCount).toBe(0);
    expect(p.contentWordDensity).toBe(0);
  });
});
