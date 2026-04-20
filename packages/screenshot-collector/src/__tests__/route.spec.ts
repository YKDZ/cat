import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadRouteManifest, mergeBindings, resolveRoutes } from "../route.ts";

describe("loadRouteManifest", () => {
  it("loads JSON RouteManifest format", async () => {
    const dir = await mkdtemp(join(tmpdir(), "route-test-"));
    const file = join(dir, "routes.json");
    await writeFile(
      file,
      JSON.stringify({
        routes: [{ template: "/project/$ref:project" }],
        bindings: { project: "abc-123" },
      }),
    );

    try {
      const manifest = await loadRouteManifest(file);
      expect(manifest.routes).toHaveLength(1);
      expect(manifest.bindings?.project).toBe("abc-123");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("loads YAML RouteManifest format", async () => {
    const dir = await mkdtemp(join(tmpdir(), "route-test-"));
    const file = join(dir, "routes.yaml");
    await writeFile(
      file,
      "routes:\n  - template: /\n  - template: /project/$ref:project\nbindings:\n  project: abc\n",
    );

    try {
      const manifest = await loadRouteManifest(file);
      expect(manifest.routes).toHaveLength(2);
      expect(manifest.bindings?.project).toBe("abc");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("loads legacy array format", async () => {
    const dir = await mkdtemp(join(tmpdir(), "route-test-"));
    const file = join(dir, "routes.json");
    await writeFile(
      file,
      JSON.stringify([{ path: "/", waitAfterLoad: 1000 }, { path: "/about" }]),
    );

    try {
      const manifest = await loadRouteManifest(file);
      expect(manifest.routes).toHaveLength(2);
      expect(manifest.routes[0].template).toBe("/");
      expect(manifest.routes[0].waitAfterLoad).toBe(1000);
      expect(manifest.bindings).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("mergeBindings", () => {
  it("CLI bindings override file bindings", () => {
    const result = mergeBindings({ a: "1", b: "2" }, { b: "3", c: "4" });
    expect(result).toEqual({ a: "1", b: "3", c: "4" });
  });

  it("handles undefined inputs", () => {
    expect(mergeBindings(undefined, undefined)).toEqual({});
    expect(mergeBindings({ a: "1" }, undefined)).toEqual({ a: "1" });
    expect(mergeBindings(undefined, { a: "1" })).toEqual({ a: "1" });
  });
});

describe("resolveRoutes", () => {
  it("resolves placeholders to concrete paths", () => {
    const routes = resolveRoutes({
      routes: [{ template: "/" }, { template: "/project/$ref:project" }],
      bindings: { project: "abc-123" },
    });

    expect(routes).toHaveLength(2);
    expect(routes[0].path).toBe("/");
    expect(routes[1].path).toBe("/project/abc-123");
  });

  it("extra bindings override manifest bindings", () => {
    const routes = resolveRoutes(
      {
        routes: [{ template: "/project/$ref:project" }],
        bindings: { project: "old" },
      },
      { project: "new" },
    );

    expect(routes[0].path).toBe("/project/new");
  });

  it("throws on missing bindings", () => {
    expect(() =>
      resolveRoutes({
        routes: [{ template: "/project/$ref:missing" }],
      }),
    ).toThrow("Missing bindings");
  });
});
