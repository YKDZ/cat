import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  serverExternalPackages,
  serverPluginNoExternal,
  serverWorkspaceNoExternal,
} from "./config/server-packages.ts";

const hasTypeScriptSourceExport = (value: unknown): boolean => {
  if (typeof value === "string") {
    return value.endsWith(".ts") && !value.endsWith(".d.ts");
  }
  if (value === null || typeof value !== "object") return false;
  return Object.values(value).some(hasTypeScriptSourceExport);
};

const parseJson = (value: string): unknown => JSON.parse(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

describe("server workspace externalization", () => {
  it("does not externalize private JIT packages or built-in plugins", () => {
    const packagesRoot = resolve(import.meta.dirname, "../../../packages");
    const privateJitPackages = readdirSync(packagesRoot).flatMap(
      (directory) => {
        const manifestPath = resolve(packagesRoot, directory, "package.json");
        if (!existsSync(manifestPath)) return [];
        const manifest = parseJson(readFileSync(manifestPath, "utf8"));
        return isRecord(manifest) &&
          manifest.private === true &&
          hasTypeScriptSourceExport(manifest.exports) &&
          typeof manifest.name === "string"
          ? [manifest.name]
          : [];
      },
    );

    expect(serverExternalPackages).not.toEqual(
      expect.arrayContaining(privateJitPackages),
    );
    expect(
      privateJitPackages.every((name) => serverWorkspaceNoExternal.test(name)),
    ).toBe(true);
    expect(serverWorkspaceNoExternal.test("@cat/app-api")).toBe(true);
    expect(serverWorkspaceNoExternal.test("@cat/plugin-core")).toBe(false);
    expect(
      serverPluginNoExternal.test("@cat-plugin/password-auth-provider"),
    ).toBe(true);
  });
});
