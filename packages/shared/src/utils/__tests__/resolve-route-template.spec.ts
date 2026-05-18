import { describe, expect, it } from "vitest";

import { resolveRouteTemplate } from "../resolve-route-template.ts";

describe("resolveRouteTemplate", () => {
  it("resolves a simple placeholder", () => {
    expect(
      resolveRouteTemplate("/project/$ref:project", { project: "abc-123" }),
    ).toBe("/project/abc-123");
  });

  it("resolves multiple placeholders", () => {
    const template =
      "/editor/project/$ref:project/$ref:language:target/auto?nodes=$ref:content-node:elements";
    const bindings = {
      project: "abc-123",
      "content-node:elements": "42",
      "language:target": "67",
    };
    expect(resolveRouteTemplate(template, bindings)).toBe(
      "/editor/project/abc-123/67/auto?nodes=42",
    );
  });

  it("returns template unchanged when no placeholders", () => {
    expect(resolveRouteTemplate("/about", {})).toBe("/about");
  });

  it("throws listing all missing bindings", () => {
    const template =
      "/editor/project/$ref:project/zh-Hans/auto?nodes=$ref:content-node:elements";
    expect(() => resolveRouteTemplate(template, {})).toThrow(
      "Missing bindings for route template",
    );
    expect(() => resolveRouteTemplate(template, {})).toThrow(/project/);
    expect(() => resolveRouteTemplate(template, {})).toThrow(/content-node/);
  });

  it("handles names with colons, dashes, underscores", () => {
    expect(resolveRouteTemplate("/x/$ref:a-b_c:d", { "a-b_c:d": "val" })).toBe(
      "/x/val",
    );
  });

  it("stops name at slash boundary", () => {
    expect(resolveRouteTemplate("/$ref:a/b", { a: "1" })).toBe("/1/b");
  });
});
