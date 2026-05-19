import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadDevSeed } from "@/loader";

const writeJson = async (path: string, value: unknown): Promise<void> => {
  await writeFile(path, JSON.stringify(value, null, 2), "utf-8");
};

const writeMinimalDataset = async (dir: string): Promise<void> => {
  await mkdir(join(dir, "seed"), { recursive: true });
  await writeFile(
    join(dir, "seed.yaml"),
    `name: local-override-test
seed:
  project: seed/project.json
plugins:
  loader: real
  overrides:
    - plugin: openai-vectorizer
      scope: GLOBAL
      config:
        model-id: dataset-model
        baseURL: http://dataset-vectorizer.test/v1
        apiKey: dataset-key
    - plugin: pgvector-storage
      scope: GLOBAL
      config: {}
`,
    "utf-8",
  );
  await writeJson(join(dir, "seed/project.json"), {
    name: "Local Override Test",
    sourceLanguage: "en",
    translationLanguages: ["zh-Hans"],
  });
};

describe("loadDevSeed local overrides", () => {
  const originalEnv = { ...process.env };
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "seed-loader-"));
    process.env.LOCAL_VECTORIZER_URL = "http://local-vectorizer.test/v1";
    await writeMinimalDataset(dir);
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await rm(dir, { recursive: true, force: true });
  });

  it("loads local plugin overrides and replaces matching dataset entries", async () => {
    const localPath = join(dir, "seed.local.yaml");
    await writeFile(
      localPath,
      `plugins:
  overrides:
    - plugin: openai-vectorizer
      scope: GLOBAL
      config:
        model-id: local-model
        baseURL: "\${LOCAL_VECTORIZER_URL}"
        apiKey: local-key
    - plugin: spacy-segmenter
      scope: GLOBAL
      config:
        serverUrl: http://local-spacy.test
`,
      "utf-8",
    );

    const loaded = loadDevSeed(dir, { localOverridePaths: [localPath] });

    expect(loaded.localOverrideSources).toEqual([
      { path: localPath, pluginOverrideCount: 2 },
    ]);
    expect(loaded.config.plugins.overrides).toHaveLength(3);
    expect(
      loaded.config.plugins.overrides.find(
        (override) => override.plugin === "openai-vectorizer",
      )?.config,
    ).toEqual({
      "model-id": "local-model",
      baseURL: "http://local-vectorizer.test/v1",
      apiKey: "local-key",
    });
    expect(
      loaded.config.plugins.overrides.some(
        (override) => override.plugin === "pgvector-storage",
      ),
    ).toBe(true);
    expect(
      loaded.config.plugins.overrides.some(
        (override) => override.plugin === "spacy-segmenter",
      ),
    ).toBe(true);
  });

  it("accepts array-valued plugin config from local overrides", async () => {
    const localPath = join(dir, "array.local.yaml");
    await writeFile(
      localPath,
      `plugins:
  overrides:
    - plugin: tei-rerank-provider
      scope: GLOBAL
      config:
        - baseURL: http://local-rerank.test
          model-id: reranker
`,
      "utf-8",
    );

    const loaded = loadDevSeed(dir, { localOverridePaths: [localPath] });

    expect(
      loaded.config.plugins.overrides.find(
        (override) => override.plugin === "tei-rerank-provider",
      )?.config,
    ).toEqual([
      { baseURL: "http://local-rerank.test", "model-id": "reranker" },
    ]);
  });

  it("does not require env vars from dataset plugin configs replaced by local overrides", async () => {
    const localPath = join(dir, "secret.local.yaml");
    await writeFile(
      join(dir, "seed.yaml"),
      `name: local-override-test
seed:
  project: seed/project.json
plugins:
  loader: real
  overrides:
    - plugin: openai-llm-provider
      scope: GLOBAL
      config:
        apiKey: "\${REPLACED_LLM_API_KEY}"
        model: old-model
`,
      "utf-8",
    );
    await writeFile(
      localPath,
      `plugins:
  overrides:
    - plugin: openai-llm-provider
      scope: GLOBAL
      config:
        - apiKey: local-key
          model: local-model
`,
      "utf-8",
    );

    const loaded = loadDevSeed(dir, { localOverridePaths: [localPath] });

    expect(
      loaded.config.plugins.overrides.find(
        (override) => override.plugin === "openai-llm-provider",
      )?.config,
    ).toEqual([{ apiKey: "local-key", model: "local-model" }]);
  });

  it("throws when unresolved env vars remain after local overrides", async () => {
    await writeFile(
      join(dir, "seed.yaml"),
      `name: local-override-test
seed:
  project: seed/project.json
plugins:
  loader: real
  overrides:
    - plugin: spacy-segmenter
      scope: GLOBAL
      config:
        serverUrl: "\${MISSING_SPACY_URL}"
`,
      "utf-8",
    );

    expect(() => loadDevSeed(dir)).toThrow(/remains unresolved/);
  });

  it("ignores missing local override files by default", () => {
    const loaded = loadDevSeed(dir, {
      localOverridePaths: [join(dir, "missing.local.yaml")],
    });

    expect(loaded.localOverrideSources).toEqual([]);
    expect(loaded.config.plugins.overrides).toHaveLength(2);
  });

  it("can require local override files to exist", () => {
    expect(() =>
      loadDevSeed(dir, {
        localOverridePaths: [join(dir, "missing.local.yaml")],
        ignoreMissingLocalOverrides: false,
      }),
    ).toThrow(/Local seed override file not found/);
  });
});
