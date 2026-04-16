import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { interpolateEnvVars } from "./env-interpolation";

describe("interpolateEnvVars", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TEST_API_KEY = "sk-secret-123";
    process.env.TEST_URL = "http://localhost:8000";
    process.env.EMPTY_VAR = "";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("replaces a single env var in a string value", () => {
    expect(interpolateEnvVars("key: ${TEST_API_KEY}")).toBe(
      "key: sk-secret-123",
    );
  });

  it("returns non-string primitives unchanged", () => {
    expect(interpolateEnvVars(42)).toBe(42);
    expect(interpolateEnvVars(true)).toBe(true);
    expect(interpolateEnvVars(null)).toBe(null);
  });

  it("recursively walks objects", () => {
    const input = {
      nested: { url: "${TEST_URL}", count: 5 },
      plain: "no-vars",
    };
    expect(interpolateEnvVars(input)).toEqual({
      nested: { url: "http://localhost:8000", count: 5 },
      plain: "no-vars",
    });
  });

  it("recursively walks arrays", () => {
    const input = ["${TEST_API_KEY}", 123, { key: "${TEST_URL}" }];
    expect(interpolateEnvVars(input)).toEqual([
      "sk-secret-123",
      123,
      { key: "http://localhost:8000" },
    ]);
  });

  it("throws on missing env var without default", () => {
    expect(() => interpolateEnvVars("${NONEXISTENT_VAR}")).toThrow(
      'Environment variable "NONEXISTENT_VAR" is not set',
    );
  });

  it("uses default value when var is not set", () => {
    expect(interpolateEnvVars("${NONEXISTENT_VAR:-fallback}")).toBe("fallback");
  });

  it("uses default value when var is empty string", () => {
    expect(interpolateEnvVars("${EMPTY_VAR:-fallback}")).toBe("fallback");
  });

  it("uses env value over default when var is set", () => {
    expect(interpolateEnvVars("${TEST_API_KEY:-fallback}")).toBe(
      "sk-secret-123",
    );
  });

  it("handles default value of empty string", () => {
    expect(interpolateEnvVars("${NONEXISTENT_VAR:-}")).toBe("");
  });

  it("handles multiple vars in one string", () => {
    expect(interpolateEnvVars("${TEST_URL}/api?key=${TEST_API_KEY}")).toBe(
      "http://localhost:8000/api?key=sk-secret-123",
    );
  });
});
