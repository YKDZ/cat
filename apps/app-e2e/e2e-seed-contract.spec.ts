import { resolve } from "node:path";

import { loadDevSeed } from "@cat/seed";
import { describe, expect, it } from "vitest";

const seedDirectory = resolve(
  import.meta.dirname,
  "../../tools/seeder/datasets/e2e",
);

describe("E2E seed contract", () => {
  it("loads the glossary and memory fixtures used by the E2E scenarios", () => {
    const seed = loadDevSeed(seedDirectory);

    expect(seed.glossarySeed).toBeDefined();
    expect(seed.memorySeed).toBeDefined();
  });
});
