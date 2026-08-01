import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

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

  it.each([
    "smoke",
    "minecraft-agent-translate",
    "minecraft-memory-recall",
    "minecraft-quality",
    "minecraft-term-recall",
    "recall-rerank",
  ])("aligns %s with the canonical language-analysis services", (suite) => {
    const suiteDirectory = resolve(import.meta.dirname, "..", "suites", suite);
    const compose = parse(
      readFileSync(resolve(suiteDirectory, "compose.eval.yaml"), "utf8"),
    ) as { include?: string[] };
    const suiteSource = readFileSync(
      resolve(suiteDirectory, "suite.yaml"),
      "utf8",
    );

    expect(compose.include).toEqual(["../../compose.services.yaml"]);
    if (suite !== "smoke") {
      expect(suiteSource).toContain("http://172.17.0.1:8000");
      expect(suiteSource).toContain("http://172.17.0.1:11435/v1");
    }
  });

  it("publishes the canonical service ports used by suite defaults", () => {
    const compose = parse(
      readFileSync(
        resolve(import.meta.dirname, "..", "compose.services.yaml"),
        "utf8",
      ),
    ) as {
      services: Record<string, { ports?: string[] }>;
    };

    expect(compose.services.spacy?.ports).toContain("8000:8000");
    expect(compose.services.ollama?.ports).toContain("11435:11434");
  });
});
