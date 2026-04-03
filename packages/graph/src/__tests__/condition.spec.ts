import { describe, expect, it } from "vitest";

import {
  evaluateCondition,
  parseExpectedValue,
  resolvePath,
} from "../condition.ts";

describe("resolvePath", () => {
  it("resolves a top-level key", () => {
    expect(resolvePath({ a: 1 }, "a")).toBe(1);
  });

  it("resolves a nested key", () => {
    expect(resolvePath({ a: { b: { c: "deep" } } }, "a.b.c")).toBe("deep");
  });

  it("returns undefined for a missing key", () => {
    expect(resolvePath({ a: 1 }, "b")).toBeUndefined();
  });

  it("returns undefined when traversing a non-object", () => {
    expect(resolvePath({ a: 42 }, "a.b")).toBeUndefined();
  });

  it("returns undefined for an empty path", () => {
    expect(resolvePath({ a: 1 }, "")).toBeUndefined();
  });

  it("returns undefined when data is null", () => {
    expect(resolvePath(null, "a")).toBeUndefined();
  });
});

describe("parseExpectedValue", () => {
  it("parses 'true' as boolean true", () => {
    expect(parseExpectedValue("true")).toBe(true);
  });

  it("parses 'false' as boolean false", () => {
    expect(parseExpectedValue("false")).toBe(false);
  });

  it("parses 'null' as null", () => {
    expect(parseExpectedValue("null")).toBeNull();
  });

  it("parses a numeric string as a number", () => {
    expect(parseExpectedValue("42")).toBe(42);
    expect(parseExpectedValue("3.14")).toBeCloseTo(3.14);
  });

  it("returns the raw string for non-numeric non-keyword values", () => {
    expect(parseExpectedValue("hello")).toBe("hello");
  });

  it("handles whitespace by trimming", () => {
    expect(parseExpectedValue("  true  ")).toBe(true);
  });
});

describe("evaluateCondition — eq", () => {
  it("returns true when field equals the expected value", () => {
    expect(
      evaluateCondition(
        { field: "status", operator: "eq", value: "done" },
        { status: "done" },
      ),
    ).toBe(true);
  });

  it("returns false when field differs", () => {
    expect(
      evaluateCondition(
        { field: "status", operator: "eq", value: "done" },
        { status: "pending" },
      ),
    ).toBe(false);
  });
});

describe("evaluateCondition — neq", () => {
  it("returns true when field differs from expected value", () => {
    expect(
      evaluateCondition(
        { field: "status", operator: "neq", value: "done" },
        { status: "pending" },
      ),
    ).toBe(true);
  });

  it("returns false when field equals expected value", () => {
    expect(
      evaluateCondition(
        { field: "status", operator: "neq", value: "done" },
        { status: "done" },
      ),
    ).toBe(false);
  });
});

describe("evaluateCondition — exists / not_exists", () => {
  it("exists returns true for a non-null field", () => {
    expect(
      evaluateCondition(
        { field: "result", operator: "exists" },
        { result: "ok" },
      ),
    ).toBe(true);
  });

  it("exists returns false for undefined", () => {
    expect(evaluateCondition({ field: "result", operator: "exists" }, {})).toBe(
      false,
    );
  });

  it("not_exists returns true when field is absent", () => {
    expect(
      evaluateCondition({ field: "error", operator: "not_exists" }, {}),
    ).toBe(true);
  });

  it("not_exists returns false when field is present", () => {
    expect(
      evaluateCondition(
        { field: "error", operator: "not_exists" },
        { error: "oops" },
      ),
    ).toBe(false);
  });
});

describe("evaluateCondition — in", () => {
  it("returns true when field value is in the list", () => {
    expect(
      evaluateCondition(
        { field: "role", operator: "in", value: ["admin", "editor"] },
        { role: "editor" },
      ),
    ).toBe(true);
  });

  it("returns false when field value is not in the list", () => {
    expect(
      evaluateCondition(
        { field: "role", operator: "in", value: ["admin", "editor"] },
        { role: "viewer" },
      ),
    ).toBe(false);
  });

  it("returns false when value is not an array", () => {
    expect(
      evaluateCondition(
        { field: "role", operator: "in", value: "admin" },
        { role: "admin" },
      ),
    ).toBe(false);
  });
});

describe("evaluateCondition — gt / lt", () => {
  it("gt returns true when field > expected", () => {
    expect(
      evaluateCondition(
        { field: "score", operator: "gt", value: 5 },
        { score: 10 },
      ),
    ).toBe(true);
  });

  it("gt returns false when field <= expected", () => {
    expect(
      evaluateCondition(
        { field: "score", operator: "gt", value: 10 },
        { score: 10 },
      ),
    ).toBe(false);
  });

  it("lt returns true when field < expected", () => {
    expect(
      evaluateCondition(
        { field: "count", operator: "lt", value: 3 },
        { count: 1 },
      ),
    ).toBe(true);
  });

  it("lt returns false when field >= expected", () => {
    expect(
      evaluateCondition(
        { field: "count", operator: "lt", value: 1 },
        { count: 5 },
      ),
    ).toBe(false);
  });

  it("returns false when values are non-numeric", () => {
    expect(
      evaluateCondition(
        { field: "tag", operator: "gt", value: "hello" },
        { tag: "world" },
      ),
    ).toBe(false);
  });
});

describe("evaluateCondition — nested field paths", () => {
  it("resolves a dotted field path", () => {
    expect(
      evaluateCondition(
        { field: "user.role", operator: "eq", value: "admin" },
        { user: { role: "admin" } },
      ),
    ).toBe(true);
  });
});
