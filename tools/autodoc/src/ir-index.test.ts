import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { PackageIR } from "./ir.js";

import { buildIndex, saveIndex, loadIndex, findSymbols } from "./ir-index.js";

const makePackage = (
  pkgName: string,
  symbols: Array<{ name: string; kind: "function" | "interface" | "const" }>,
): PackageIR => ({
  name: pkgName,
  path: `/fake/${pkgName}`,
  description: `Desc of ${pkgName}`,
  priority: "medium",
  modules: [
    {
      relativePath: "src/index.ts",
      symbols: symbols.map((s) => ({
        id: `${pkgName}:src/index:${s.name}`,
        name: s.name,
        kind: s.kind,
        isAsync: false,
        isExported: true,
        sourceLocation: {
          filePath: `${pkgName}/src/index.ts`,
          line: 1,
          endLine: 5,
        },
      })),
    },
  ],
});

describe("buildIndex", () => {
  it("flattens PackageIR[] into SymbolIndexEntry[]", () => {
    const packages: PackageIR[] = [
      makePackage("@cat/a", [
        { name: "foo", kind: "function" },
        { name: "Bar", kind: "interface" },
      ]),
      makePackage("@cat/b", [{ name: "baz", kind: "const" }]),
    ];

    const entries = buildIndex(packages);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      id: "@cat/a:src/index:foo",
      name: "foo",
      kind: "function",
      packageName: "@cat/a",
      filePath: "@cat/a/src/index.ts",
      line: 1,
      endLine: 5,
    });
    expect(entries[2]).toMatchObject({ name: "baz", packageName: "@cat/b" });
  });

  it("returns empty array for empty packages", () => {
    expect(buildIndex([])).toEqual([]);
  });

  it("handles packages with empty modules", () => {
    const pkg: PackageIR = {
      name: "@cat/empty",
      path: "/fake/@cat/empty",
      priority: "low",
      modules: [],
    };
    expect(buildIndex([pkg])).toEqual([]);
  });
});

describe("findSymbols", () => {
  const packages: PackageIR[] = [
    makePackage("@cat/domain", [
      { name: "createProject", kind: "function" },
      { name: "Project", kind: "interface" },
    ]),
    makePackage("@cat/shared", [{ name: "createSlug", kind: "function" }]),
  ];
  const entries = buildIndex(packages);

  it("returns exact ID match first", () => {
    const results = findSymbols(entries, "@cat/domain:src/index:createProject");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("createProject");
  });

  it("returns exact name match", () => {
    const results = findSymbols(entries, "Project");
    expect(results).toHaveLength(1);
    expect(results[0].kind).toBe("interface");
  });

  it("returns fuzzy matches when no exact match", () => {
    const results = findSymbols(entries, "create");
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.map((r) => r.name)).toContain("createProject");
    expect(results.map((r) => r.name)).toContain("createSlug");
  });

  it("returns empty array when no match", () => {
    expect(findSymbols(entries, "nonExistentSymbol12345xyz")).toEqual([]);
  });
});

describe("saveIndex and loadIndex", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "autodoc-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("roundtrips entries through JSON file", async () => {
    const packages = [
      makePackage("@cat/domain", [{ name: "createProject", kind: "function" }]),
    ];
    const entries = buildIndex(packages);
    const indexPath = join(tmpDir, "symbol-index.json");

    await saveIndex(entries, indexPath);
    const loaded = await loadIndex(indexPath);

    expect(loaded).toEqual(entries);
  });
});
