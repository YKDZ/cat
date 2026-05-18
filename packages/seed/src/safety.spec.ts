import { describe, expect, it } from "vitest";

import { assertSafeDatabaseTarget } from "@/safety";

describe("assertSafeDatabaseTarget", () => {
  it("allows localhost development databases", () => {
    expect(() => {
      assertSafeDatabaseTarget("postgres://user:pass@localhost:5432/cat_dev");
    }).not.toThrow();
  });

  it("allows test-named remote databases", () => {
    expect(() => {
      assertSafeDatabaseTarget(
        "postgres://user:pass@example.com:5432/cat_test",
      );
    }).not.toThrow();
  });

  it("blocks production environment without explicit override", () => {
    expect(() => {
      assertSafeDatabaseTarget("postgres://user:pass@localhost:5432/cat_dev", {
        nodeEnv: "production",
      });
    }).toThrow(/NODE_ENV=production/);
  });

  it("allows explicit unsafe override", () => {
    expect(() => {
      assertSafeDatabaseTarget("postgres://user:pass@example.com:5432/cat", {
        allowUnsafeReset: true,
        nodeEnv: "production",
      });
    }).not.toThrow();
  });
});
