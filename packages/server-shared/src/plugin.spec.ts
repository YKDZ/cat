import { PluginManager } from "@cat/plugin-core";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  PluginManager.clear();
});

describe("resolvePluginManager", () => {
  it("preserves a manager created by another module instance", async () => {
    const manager = new PluginManager("GLOBAL", "");
    vi.resetModules();
    const { resolvePluginManager } = await import("./plugin.ts");

    expect(resolvePluginManager(manager)).toBe(manager);
  });
});
