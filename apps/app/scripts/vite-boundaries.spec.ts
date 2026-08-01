import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const pluginPackageDirectories = [
  "basic-qa-checker",
  "basic-tokenizer",
  "json-file-handler",
  "libretranslate-advisor",
  "local-storage-provider",
  "markdown-file-handler",
  "openai-llm-provider",
  "openai-vectorizer",
  "password-auth-provider",
  "pgvector-storage",
  "s3-storage-provider",
  "spacy-language-analyzer",
  "tei-rerank-provider",
  "tiny-widget",
  "totp-mfa-provider",
  "yaml-file-handler",
] as const;

describe("development module boundaries", () => {
  it("keeps private JIT probes package-resolved while built-in plugins use distributions", () => {
    const config = readFileSync(
      resolve(import.meta.dirname, "../vite.config.ts"),
      "utf8",
    );

    expect(config).toContain('find: "@cat/e2e-hmr-private"');
    expect(config).toContain("hmrPrivatePackageRoot()");
    expect(config).toContain("server.watcher.add(hmrProbePaths())");
    expect(config).not.toContain('"private-jit/src/probe.vue"');
    expect(
      readFileSync(
        resolve(import.meta.dirname, "../src/e2e/HmrProbeHost.vue"),
        "utf8",
      ),
    ).toContain('"#e2e-hmr-application", "@cat/e2e-hmr-private"');
    expect(config).toContain('"../../@cat-plugin/$1/dist/index.js"');
    expect(config).not.toContain('"../../@cat-plugin/$1/src/index.ts"');
    expect(readdirSync(resolve(root, "@cat-plugin")).sort()).toEqual(
      [...pluginPackageDirectories].sort(),
    );
    for (const entry of pluginPackageDirectories) {
      const packageJson = JSON.parse(
        readFileSync(
          resolve(root, "@cat-plugin", entry, "package.json"),
          "utf8",
        ),
      ) as {
        exports: { ".": Record<string, string> };
        keywords?: string[];
        main?: unknown;
        types?: unknown;
      };

      expect(packageJson.exports["."]).toEqual({
        source: "./src/index.ts",
        import: "./dist/index.js",
      });
      expect(packageJson.main).toBeUndefined();
      expect(packageJson.types).toBeUndefined();
      expect(packageJson.keywords ?? []).not.toContain("types");
      expect(packageJson.keywords ?? []).not.toContain("typescript");
    }
  });
});
