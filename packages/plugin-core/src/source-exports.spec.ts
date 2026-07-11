import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { z } from "zod";

const appRoot = resolve(import.meta.dirname, "../../../apps/app");
const exportTargetSchema = z.object({
  import: z.string(),
  types: z.string(),
});
const manifestSchema = z.object({
  exports: z.record(z.string(), exportTargetSchema),
  publishConfig: z.object({
    exports: z.record(z.string(), exportTargetSchema),
  }),
});

const resolveFromApp = (specifier: string, conditions: string[] = []): string =>
  execFileSync(
    process.execPath,
    [
      ...conditions.map((condition) => `--conditions=${condition}`),
      "--input-type=module",
      "--eval",
      `process.stdout.write(import.meta.resolve(${JSON.stringify(specifier)}))`,
    ],
    { cwd: appRoot, encoding: "utf8" },
  );

const listFiles = (directory: string, prefix = ""): string[] =>
  readdirSync(directory).flatMap((name) => {
    const relativePath = prefix === "" ? name : `${prefix}/${name}`;
    const absolutePath = resolve(directory, name);
    return statSync(absolutePath).isDirectory()
      ? listFiles(absolutePath, relativePath)
      : [relativePath];
  });

describe("@cat/plugin-core workspace exports", () => {
  it("uses source types locally and compiled declarations when published", () => {
    const manifest = manifestSchema.parse(
      JSON.parse(
        readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"),
      ),
    );

    expect(manifest.exports["."]?.types).toBe("./src/index.ts");
    expect(manifest.exports["./client"]?.types).toBe("./src/client/index.ts");
    expect(manifest.exports["."]?.import).toBe("./src/index.ts");
    expect(manifest.publishConfig.exports["."]?.types).toBe(
      "./dist/index.d.ts",
    );
    expect(manifest.publishConfig.exports["."]?.import).toBe("./dist/index.js");
  });

  it.each([
    ["@cat/plugin-core", "index.ts"],
    ["@cat/plugin-core/client", "client/index.ts"],
  ])(
    "resolves %s to a current source snapshot when requested",
    (specifier, sourcePath) => {
      const resolvedPath = fileURLToPath(resolveFromApp(specifier, ["source"]));
      expect(resolvedPath.endsWith(`/src/${sourcePath}`)).toBe(true);
      expect(readFileSync(resolvedPath, "utf8")).toBe(
        readFileSync(resolve(import.meta.dirname, sourcePath), "utf8"),
      );
    },
  );

  it("uses source by default inside the workspace", () => {
    expect(resolveFromApp("@cat/plugin-core").endsWith("/src/index.ts")).toBe(
      true,
    );
  });

  it("keeps the complete injected source snapshot current", () => {
    const installedEntry = fileURLToPath(
      resolveFromApp("@cat/plugin-core", ["source"]),
    );
    const installedSource = resolve(installedEntry, "..");
    const workspaceSource = import.meta.dirname;
    const workspaceFiles = listFiles(workspaceSource).sort();

    expect(listFiles(installedSource).sort()).toEqual(workspaceFiles);
    for (const relativePath of workspaceFiles) {
      expect(readFileSync(resolve(installedSource, relativePath), "utf8")).toBe(
        readFileSync(resolve(workspaceSource, relativePath), "utf8"),
      );
    }
  });
});
