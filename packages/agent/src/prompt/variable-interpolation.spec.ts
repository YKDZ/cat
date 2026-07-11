import { describe, expect, it } from "vitest";

import { interpolate } from "./variable-interpolation.ts";

describe("interpolate", () => {
  it("replaces an own variable", () => {
    expect(interpolate("Hello, {{name}}", { name: "Ada" })).toBe("Hello, Ada");
  });

  it("does not interpolate inherited properties", () => {
    const variables = { own: "value" };
    Object.setPrototypeOf(variables, { name: "inherited" });

    expect(interpolate("Hello, {{name}}", variables)).toBe("Hello, {{name}}");
  });
});
