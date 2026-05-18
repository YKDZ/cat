import { describe, expect, it } from "vitest";

import { DevSeedConfigSchema } from "@/schemas";

describe("bootstrap profile schema", () => {
  it("accepts an explicit zh-Hans -> en bootstrap profile", () => {
    const config = DevSeedConfigSchema.parse({
      name: "bootstrap",
      seed: { project: "seed/project.json" },
      vectorization: { enabled: false },
      plugins: { loader: "real", overrides: [] },
      bootstrap: {
        enabled: true,
        sourceLanguageId: "zh-Hans",
        targetLanguageIds: ["en"],
        source: { baseDir: "../../../../apps/app", globs: ["src/**/*.vue"] },
        localeCatalogs: [
          {
            path: "../../../../apps/app/locales/en_us.json",
            localeId: "en_us",
            languageId: "en",
          },
        ],
      },
    });
    expect(config.bootstrap?.sourceLanguageId).toBe("zh-Hans");
    expect(config.bootstrap?.localeCatalogs[0]?.languageId).toBe("en");
  });

  it("rejects missing explicit locale language mapping", () => {
    expect(() =>
      DevSeedConfigSchema.parse({
        name: "bootstrap",
        seed: { project: "seed/project.json" },
        plugins: { loader: "real", overrides: [] },
        bootstrap: {
          enabled: true,
          sourceLanguageId: "zh-Hans",
          targetLanguageIds: ["en"],
          source: { baseDir: "app", globs: ["src/**/*.vue"] },
          localeCatalogs: [{ path: "locales/en_us.json", localeId: "en_us" }],
        },
      }),
    ).toThrow();
  });
});
