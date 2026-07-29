import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");

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
    for (const entry of readdirSync(resolve(root, "@cat-plugin"))) {
      const packageJson = JSON.parse(
        readFileSync(
          resolve(root, "@cat-plugin", entry, "package.json"),
          "utf8",
        ),
      ) as {
        main: string;
        exports: { ".": { import: string } };
      };

      expect(packageJson.main).toBe("./dist/index.js");
      expect(packageJson.exports["."].import).toBe("./dist/index.js");
    }
  });
});
