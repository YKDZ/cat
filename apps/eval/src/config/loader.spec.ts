import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadSuite } from "./loader.ts";

describe("loadSuite", () => {
  it("loads the scoped keyword recall regression", () => {
    const suite = loadSuite(
      fileURLToPath(new URL("../../suites/minecraft-quality", import.meta.url)),
    );

    const scenario = suite.config.scenarios.find(
      ({ name }) => name === "keyword-recall",
    );

    expect(scenario).toMatchObject({
      type: "memory-recall",
      "test-set": "test-sets/keyword-recall.yaml",
      scorers: ["channel-coverage", "hit-rate", "confidence", "latency"],
    });
    expect(suite.testSets.get("test-sets/keyword-recall.yaml")).toMatchObject({
      cases: [
        {
          expectedMemories: [{ requiredChannels: ["keyword"] }],
        },
      ],
    });
  });
});
