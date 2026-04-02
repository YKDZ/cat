import { describe, it, expect } from "vitest";

import type { PackageIR, SymbolIR, SourceLocation } from "../ir.js";

import { createPackageRenderer } from "./package-renderer.js";

const loc: SourceLocation = { filePath: "src/index.ts", line: 1, endLine: 5 };

const makeSym = (
  overrides: Partial<SymbolIR> & Pick<SymbolIR, "name">,
): SymbolIR => ({
  id: `@test/pkg:src/index:${overrides.name}`,
  kind: "function",
  isAsync: false,
  isExported: true,
  sourceLocation: loc,
  ...overrides,
});

const makePkg = (symbols: SymbolIR[]): PackageIR => ({
  name: "@test/pkg",
  path: "/fake",
  priority: "medium",
  modules: [{ relativePath: "src/index.ts", symbols }],
});

describe("createPackageRenderer", () => {
  const { renderPackage } = createPackageRenderer();

  describe("renderSymbolBlock — JSDoc in code block", () => {
    it("embeds single-line description as JSDoc comment", () => {
      const output = renderPackage(
        makePkg([
          makeSym({
            name: "doThing",
            description: "Do a thing.",
            signature: "export const doThing = () => {...}",
          }),
        ]),
        { detailed: true },
      );
      expect(output).toContain("/**\n * Do a thing.\n */");
    });

    it("prefixes every line with ' * ' for multi-line descriptions", () => {
      const output = renderPackage(
        makePkg([
          makeSym({
            name: "vectorAlign",
            description:
              "向量相似度术语对齐\n\n1. 向量化候选术语\n2. 跨语言对比\n3. 记录配对",
            signature:
              "export const vectorAlign = async (data: Input) => {...}",
          }),
        ]),
        { detailed: true },
      );

      const expected = [
        "/**",
        " * 向量相似度术语对齐",
        " *",
        " * 1. 向量化候选术语",
        " * 2. 跨语言对比",
        " * 3. 记录配对",
        " */",
      ].join("\n");
      expect(output).toContain(expected);
    });

    it("renders code block without JSDoc when description is absent", () => {
      const output = renderPackage(
        makePkg([
          makeSym({
            name: "noDesc",
            signature: "export const noDesc = () => {...}",
          }),
        ]),
        { detailed: true },
      );
      expect(output).toContain("export const noDesc = () => {...}");
      expect(output).not.toContain("/**");
    });

    it("does not render redundant parameter list", () => {
      const output = renderPackage(
        makePkg([
          makeSym({
            name: "withParams",
            signature:
              "export const withParams = (a: string, b: number) => {...}",
            parameters: [
              { name: "a", type: "string", optional: false },
              { name: "b", type: "number", optional: false },
            ],
          }),
        ]),
        { detailed: true },
      );
      // Should not contain a markdown list item with parameter inline code
      expect(output).not.toMatch(/^- `a.*: string`/m);
      expect(output).not.toMatch(/^- `b.*: number`/m);
    });
  });
});
