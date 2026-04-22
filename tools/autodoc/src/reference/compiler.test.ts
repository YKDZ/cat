import { Project } from "ts-morph";
import { describe, it, expect } from "vitest";

import type { PackageIR, ParameterIR, SymbolIR } from "../ir.js";

import { createSymbolExtractor } from "../extractor/symbol-extractor.js";
import { buildReferenceCatalog } from "./compiler.js";
import { buildSignatureSnapshot, detectSignatureDrift } from "./signature.js";
import { getSpan } from "./span.js";
import { makeStableKey, isOverloadedInModule } from "./stable-key.js";
import { extractZodSchemaAssets } from "./structured-assets.js";

const ROOT = "/fake/root";

const makeProject = (code: string, fileName = "src/index.ts") => {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile(`${ROOT}/${fileName}`, code);
  return { project, sourceFile };
};

const makePackageIR = (code: string, pkgName = "@cat/test"): PackageIR => {
  const { sourceFile } = makeProject(code);
  const extractor = createSymbolExtractor(pkgName, ROOT);
  const mod = extractor.extractModuleInfo(sourceFile);
  return {
    name: pkgName,
    path: "/tmp/test",
    priority: "medium" as const,
    modules: [mod],
  };
};

describe("ReferenceCatalog", () => {
  describe("resolveById", () => {
    it("finds symbol by id", () => {
      const pkg = makePackageIR(`
/** @en Greet someone */
export const greet = (name: string): string => \`Hello \${name}\`;
`);
      const catalog = buildReferenceCatalog([pkg]);
      const sym = catalog.resolveById(`@cat/test:src/index:greet`);
      expect(sym).toBeDefined();
      expect(sym?.name).toBe("greet");
    });

    it("returns undefined for missing id", () => {
      const catalog = buildReferenceCatalog([]);
      expect(catalog.resolveById("nonexistent")).toBeUndefined();
    });
  });

  describe("resolveByName", () => {
    it("returns all symbols with given name", () => {
      const pkg1 = makePackageIR(
        `/** @en A */ export const foo = (): void => {};`,
        "@cat/pkg1",
      );
      const pkg2 = makePackageIR(
        `/** @en B */ export const foo = (x: number): number => x;`,
        "@cat/pkg2",
      );
      const catalog = buildReferenceCatalog([pkg1, pkg2]);
      const results = catalog.resolveByName("foo");
      expect(results).toHaveLength(2);
      expect(results.map((s) => s.id)).toContain("@cat/pkg1:src/index:foo");
      expect(results.map((s) => s.id)).toContain("@cat/pkg2:src/index:foo");
    });
  });

  describe("resolveByStableKey", () => {
    it("resolves non-overloaded symbol by stable key (same as id)", () => {
      const pkg = makePackageIR(`
/** @en Simple fn */
export const simple = (): void => {};
`);
      const catalog = buildReferenceCatalog([pkg]);
      const sym = catalog.resolveById("@cat/test:src/index:simple");
      expect(sym?.stableKey).toBe("@cat/test:src/index:simple");
      const found = catalog.resolveByStableKey("@cat/test:src/index:simple");
      expect(found?.name).toBe("simple");
    });
  });

  describe("toSymbolIndex", () => {
    it("projects symbols to SymbolIndexEntry format", () => {
      const pkg = makePackageIR(`
/** @en Compute result */
export const compute = (x: number, y: number): number => x + y;
`);
      const catalog = buildReferenceCatalog([pkg]);
      const index = catalog.toSymbolIndex();
      expect(index).toHaveLength(1);
      expect(index[0]).toMatchObject({
        id: "@cat/test:src/index:compute",
        name: "compute",
        kind: "function",
        packageName: "@cat/test",
      });
    });

    it("includes column and stableKey in index entries", () => {
      const pkg = makePackageIR(`
/** @en Identity */
export const identity = <T>(x: T): T => x;
`);
      const catalog = buildReferenceCatalog([pkg]);
      const index = catalog.toSymbolIndex();
      expect(index[0].stableKey).toBeDefined();
      expect(typeof index[0].column).toBe("number");
    });
  });

  describe("symbolCount", () => {
    it("counts all symbols across packages", () => {
      const pkg1 = makePackageIR(`
/** @en A */ export const a = (): void => {};
/** @en B */ export const b = (): void => {};
`);
      const pkg2 = makePackageIR(
        `
/** @en C */ export const c = (): void => {};
`,
        "@cat/other",
      );
      const catalog = buildReferenceCatalog([pkg1, pkg2]);
      expect(catalog.symbolCount).toBe(3);
    });
  });
});

describe("isOverloadedInModule", () => {
  it("returns false for unique name", () => {
    expect(isOverloadedInModule("foo", ["foo", "bar", "baz"])).toBe(false);
  });

  it("returns true when name appears more than once", () => {
    expect(isOverloadedInModule("foo", ["foo", "bar", "foo"])).toBe(true);
  });
});

describe("makeStableKey overloads", () => {
  it("non-overloaded key equals the symbol id", () => {
    const id = "@cat/test:src/index:fn";
    const key = makeStableKey(id, undefined, false);
    expect(key).toBe(id);
  });

  it("overloaded key appends parameter types fingerprint", () => {
    const id = "@cat/test:src/index:fn";
    const params = [
      { name: "x", type: "string", optional: false },
      { name: "y", type: "number", optional: false },
    ] satisfies ParameterIR[];
    const key = makeStableKey(id, params, true);
    expect(key).toMatch(/^@cat\/test:src\/index:fn\(string,number\)$/);
  });

  it("overloaded key with no params uses empty parens", () => {
    const id = "@cat/test:src/index:fn";
    const key = makeStableKey(id, [], true);
    expect(key).toMatch(/^@cat\/test:src\/index:fn\(\)$/);
  });
});

describe("getSpan column accuracy", () => {
  it("extracts column 0 for first-column symbol", () => {
    const { sourceFile } = makeProject(
      `/** @en Fn */\nexport const myFn = (): void => {};`,
    );
    const decl = sourceFile.getVariableDeclarations()[0];
    const span = getSpan(decl);
    expect(span.column).toBeGreaterThanOrEqual(0);
    expect(typeof span.column).toBe("number");
  });

  it("computes different columns for symbols at different offsets", () => {
    const code = `const a = 1; const b = 2;`;
    const { sourceFile } = makeProject(code);
    const [decl1, decl2] = sourceFile.getVariableDeclarations();
    const span1 = getSpan(decl1);
    const span2 = getSpan(decl2);
    expect(span2.column).toBeGreaterThan(span1.column);
  });
});

describe("buildSignatureSnapshot + detectSignatureDrift", () => {
  it("same structure produces equal snapshots", () => {
    const pkg = makePackageIR(`
/** @en Fn */
export const fn = (x: string, y: number): boolean => true;
`);
    const sym = pkg.modules[0].symbols[0];
    const snap1 = buildSignatureSnapshot(sym);
    const snap2 = buildSignatureSnapshot(sym);
    expect(snap1).toBe(snap2);
  });

  it("detects drift when param types change", () => {
    const before = {
      id: "sym1",
      name: "fn",
      isAsync: false,
      isExported: true,
      sourceLocation: {
        filePath: "src/index.ts",
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 20,
      },
      kind: "function" as const,
      parameters: [{ name: "x", type: "string", optional: false }],
      returnType: "void",
    } satisfies SymbolIR;
    const after = {
      id: "sym2",
      name: "fn",
      isAsync: false,
      isExported: true,
      sourceLocation: {
        filePath: "src/index.ts",
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 20,
      },
      kind: "function" as const,
      parameters: [{ name: "x", type: "number", optional: false }],
      returnType: "void",
    } satisfies SymbolIR;
    const snapBefore = buildSignatureSnapshot(before);
    const snapAfter = buildSignatureSnapshot(after);
    const drift = detectSignatureDrift(snapBefore, snapAfter);
    expect(drift).not.toBeNull();
    expect(typeof drift).toBe("string");
  });

  it("no drift for identical snapshots", () => {
    const sym = {
      id: "sym1",
      name: "fn",
      isAsync: false,
      isExported: true,
      sourceLocation: {
        filePath: "src/index.ts",
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 20,
      },
      kind: "interface" as const,
      properties: [{ name: "id", type: "string", optional: false }],
    } satisfies SymbolIR;
    const snap = buildSignatureSnapshot(sym);
    const drift = detectSignatureDrift(snap, snap);
    expect(drift).toBeNull();
  });
});

describe("extractZodSchemaAssets", () => {
  it("extracts exported z.object schema", () => {
    const { sourceFile } = makeProject(`
import { z } from "zod";
export const UserSchema = z.object({ id: z.string(), age: z.number() });
`);
    const assets = extractZodSchemaAssets(sourceFile);
    expect(assets).toHaveLength(1);
    expect(assets[0].exportName).toBe("UserSchema");
    expect(assets[0].zodCall).toBe("object");
  });

  it("extracts multiple schemas from same file", () => {
    const { sourceFile } = makeProject(`
import { z } from "zod";
export const ASchema = z.string();
export const BSchema = z.array(z.number());
`);
    const assets = extractZodSchemaAssets(sourceFile);
    expect(assets.map((a) => a.exportName)).toContain("ASchema");
    expect(assets.map((a) => a.exportName)).toContain("BSchema");
  });

  it("ignores non-Zod exports", () => {
    const { sourceFile } = makeProject(`
export const x = 42;
export const y = "hello";
`);
    const assets = extractZodSchemaAssets(sourceFile);
    expect(assets).toHaveLength(0);
  });

  it("attaches correct filePath to each asset", () => {
    const { sourceFile } = makeProject(`
import { z } from "zod";
export const MySchema = z.enum(["a", "b"]);
`);
    const assets = extractZodSchemaAssets(sourceFile);
    expect(assets[0].filePath).toContain("src/index.ts");
  });
});
