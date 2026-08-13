import { TestPluginLoader } from "@cat/test-utils";
import { describe, expect, it } from "vitest";

import { createEvalPluginLoader } from "./seeder.ts";

describe("eval plugin loader", () => {
  it("loads release-required plugins from source builtins before the selected external loader", async () => {
    const loader = createEvalPluginLoader(new TestPluginLoader());

    await expect(
      loader.getManifest("system-pgvector-storage"),
    ).resolves.toMatchObject({
      id: "system-pgvector-storage",
      services: [
        expect.objectContaining({
          id: "native-pgvector",
          type: "VECTOR_STORAGE",
        }),
      ],
    });
    await expect(loader.getManifest("mock")).resolves.toMatchObject({
      id: "mock",
    });
    await expect(
      loader.getInstance("openai-vectorizer"),
    ).resolves.toMatchObject({ services: expect.any(Function) });
    await expect(
      loader.getInstance("spacy-language-analyzer"),
    ).resolves.toMatchObject({ services: expect.any(Function) });
  });
});
