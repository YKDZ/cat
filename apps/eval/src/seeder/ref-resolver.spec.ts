import { describe, expect, it } from "vitest";

import { RefResolver } from "./ref-resolver";

describe("RefResolver", () => {
  it("stores and retrieves refs", () => {
    const r = new RefResolver();
    r.set("concept:a", 42);
    expect(r.getId("concept:a")).toBe(42);
    expect(r.getNumericId("concept:a")).toBe(42);
    expect(r.getRef(42)).toBe("concept:a");
  });

  it("throws on unknown ref", () => {
    const r = new RefResolver();
    expect(() => r.getId("missing")).toThrow("Unknown ref");
  });

  it("throws on duplicate ref", () => {
    const r = new RefResolver();
    r.set("concept:a", 1);
    expect(() => {
      r.set("concept:a", 2);
    }).toThrow("Duplicate ref");
  });

  it("handles string IDs", () => {
    const r = new RefResolver();
    r.set("project", "uuid-123");
    expect(r.getStringId("project")).toBe("uuid-123");
  });
});
