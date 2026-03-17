import { beforeEach, describe, expect, it } from "vitest";

import type { ComponentRecord } from "@/registry/component-registry";

import { ComponentRegistry } from "@/registry/component-registry";

// ─── fixtures ────────────────────────────────────────────────────────────────

const makeRecord = (
  partial: Partial<ComponentRecord> & { pluginId: string },
): ComponentRecord => ({
  name: "cat-widget",
  slot: "editor:sidebar",
  url: "https://cdn.example.com/widget.js",
  ...partial,
});

// ─── tests ───────────────────────────────────────────────────────────────────

describe("ComponentRegistry", () => {
  let registry: ComponentRegistry;

  beforeEach(() => {
    registry = new ComponentRegistry();
  });

  // ── get / getSlot: initial state ───────────────────────────────────────────

  it("returns an empty array for an unknown pluginId", () => {
    expect(registry.get("missing-plugin")).toEqual([]);
  });

  it("returns an empty array for an unknown slot", () => {
    expect(registry.getSlot("editor:toolbar")).toEqual([]);
  });

  // ── combine ────────────────────────────────────────────────────────────────

  it("registers components and makes them retrievable by pluginId", () => {
    const record = makeRecord({ pluginId: "plugin-a" });
    registry.combine("plugin-a", [record]);

    expect(registry.get("plugin-a")).toEqual([record]);
  });

  it("registers components and makes them retrievable by slot", () => {
    const record = makeRecord({ pluginId: "plugin-a", slot: "editor:sidebar" });
    registry.combine("plugin-a", [record]);

    expect(registry.getSlot("editor:sidebar")).toEqual([record]);
  });

  it("merges components from two different plugins", () => {
    const a = makeRecord({ pluginId: "plugin-a", slot: "editor:sidebar" });
    const b = makeRecord({
      pluginId: "plugin-b",
      name: "cat-toolbar",
      slot: "editor:sidebar",
    });

    registry.combine("plugin-a", [a]);
    registry.combine("plugin-b", [b]);

    const slot = registry.getSlot("editor:sidebar");
    expect(slot).toHaveLength(2);
    expect(slot).toEqual(expect.arrayContaining([a, b]));
  });

  it("replaces existing components on a second combine (reload support)", () => {
    const v1 = makeRecord({
      pluginId: "plugin-a",
      url: "https://cdn.example.com/v1.js",
    });
    const v2 = makeRecord({
      pluginId: "plugin-a",
      url: "https://cdn.example.com/v2.js",
    });

    registry.combine("plugin-a", [v1]);
    registry.combine("plugin-a", [v2]);

    const components = registry.get("plugin-a");
    expect(components).toHaveLength(1);
    expect(components[0]?.url).toBe("https://cdn.example.com/v2.js");
  });

  // ── removeByPlugin ─────────────────────────────────────────────────────────

  it("removes all components for a given pluginId", () => {
    registry.combine("plugin-a", [makeRecord({ pluginId: "plugin-a" })]);
    registry.removeByPlugin("plugin-a");

    expect(registry.get("plugin-a")).toEqual([]);
  });

  it("slot index is updated after removeByPlugin", () => {
    const a = makeRecord({ pluginId: "plugin-a", slot: "editor:sidebar" });
    const b = makeRecord({
      pluginId: "plugin-b",
      name: "cat-toolbar",
      slot: "editor:sidebar",
    });

    registry.combine("plugin-a", [a]);
    registry.combine("plugin-b", [b]);
    registry.removeByPlugin("plugin-a");

    const slot = registry.getSlot("editor:sidebar");
    expect(slot).toHaveLength(1);
    expect(slot[0]?.pluginId).toBe("plugin-b");
  });

  it("removing a non-existent plugin is a no-op", () => {
    // should not throw
    expect(() => {
      registry.removeByPlugin("ghost-plugin");
    }).not.toThrow();
  });

  // ── multi-slot support ────────────────────────────────────────────────────

  it("separates components into their respective slots", () => {
    const sidebar = makeRecord({
      pluginId: "plugin-a",
      slot: "editor:sidebar",
    });
    const toolbar = makeRecord({
      pluginId: "plugin-a",
      name: "cat-toolbar",
      slot: "editor:toolbar",
    });

    registry.combine("plugin-a", [sidebar, toolbar]);

    expect(registry.getSlot("editor:sidebar")).toEqual([sidebar]);
    expect(registry.getSlot("editor:toolbar")).toEqual([toolbar]);
  });
});
