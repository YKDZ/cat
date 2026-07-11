import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { jsonParser, type ElementData } from "@cat/file-parsers";
import { sanitizeFileName } from "@cat/shared";
import { describe, expect, it } from "vitest";

const workspaceRoot = resolve(import.meta.dirname, "../../..");

const importFrom = (cwd: string, specifier: string): string =>
  execFileSync(
    process.execPath,
    [
      "--conditions=source",
      "--input-type=module",
      "--eval",
      `await import(${JSON.stringify(specifier)}); process.stdout.write("loaded")`,
    ],
    {
      cwd: resolve(workspaceRoot, cwd),
      encoding: "utf8",
    },
  );

describe("the JIT package chain", () => {
  it("consumes public workspace exports without a dependency build", () => {
    const elements: ElementData[] = jsonParser.parse('{"greeting":"Hello"}');

    expect(jsonParser.canParse(sanitizeFileName("messages.json"))).toBe(true);
    expect(elements).toMatchObject([
      {
        ref: "json:/greeting",
        stableSourceRef: "json:/greeting",
        text: "Hello",
      },
    ]);
  });

  it.each([
    ["packages/graph", "@cat/shared", "packages/shared/dist"],
    ["packages/workflow", "@cat/workflow", "packages/workflow/dist"],
    ["apps/app", "@cat/agent", "packages/agent/dist"],
  ])(
    "loads %s -> %s directly with the private distribution absent",
    (cwd, specifier, distPath) => {
      expect(existsSync(resolve(workspaceRoot, distPath))).toBe(false);
      expect(importFrom(cwd, specifier)).toBe("loaded");
    },
  );
});
