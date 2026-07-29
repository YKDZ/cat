import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { resolveComposeConfig } from "./compose-config.ts";

describe("resolveComposeConfig", () => {
  it("selects the suite's purpose-named Compose file", () => {
    const exists = vi.fn(() => true);
    const config = resolveComposeConfig("smoke", exists);
    const suiteDirectory = resolve(
      import.meta.dirname,
      "..",
      "suites",
      "smoke",
    );
    const composePath = resolve(suiteDirectory, "compose.eval.yaml");

    expect(exists).toHaveBeenCalledWith(composePath);
    expect(config).toEqual({
      composeArgs: ["-f", composePath, "-p", "eval-smoke"],
      composeCwd: suiteDirectory,
    });
  });

  it("rejects unsafe suite names before resolving a Compose path", () => {
    expect(() => resolveComposeConfig("../outside")).toThrow(
      "Invalid suite name",
    );
  });
});
