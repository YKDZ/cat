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

  it("extends the shared service capability contract without a local spaCy build", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "..", "compose.services.yaml"),
      "utf8",
    );
    expect(source).toContain(
      "127.0.0.1:${CAT_EVAL_SPACY_HOST_PORT:-8000}:8000",
    );
    expect(source).toContain(
      "127.0.0.1:${CAT_EVAL_OLLAMA_HOST_PORT:-11435}:11434",
    );
    expect(
      source.match(/file: \.\.\/app\/compose\.services\.yaml/g),
    ).toHaveLength(3);
    expect(source).toContain("ollama/ollama:0.16.1");
    expect(source).toContain(
      "redis:8.8.0-alpine@sha256:9d317178eceac8454a2284a9e6df2466b93c745529947f0cd42a0fa9609d7005",
    );
    expect(source).toContain("CAT_SPACY_IMAGE_ID");
    expect(source).toContain("build: !reset null");
    expect(source.match(/restart: "no"/g)).toHaveLength(4);
    expect(source.match(/no-new-privileges:true/g)).toHaveLength(4);
  });
});
