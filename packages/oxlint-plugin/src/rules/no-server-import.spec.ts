import { describe, expect, it, vi } from "vitest";

import { noServerImport } from "./no-server-import.ts";

type MockContext = {
  options: unknown[];
  report: ReturnType<typeof vi.fn>;
};

const createMockContext = (options: unknown[] = []): MockContext => ({
  options,
  report: vi.fn(),
});

const makeStringLiteral = (value: string) => ({
  type: "Literal" as const,
  value,
  raw: `"${value}"`,
});

const makeImportDecl = (source: string, importKind?: "value" | "type") => ({
  type: "ImportDeclaration" as const,
  source: makeStringLiteral(source),
  importKind,
  specifiers: [],
  phase: null,
  attributes: [],
});

const makeImportExpr = (source: string) => ({
  type: "ImportExpression" as const,
  source: makeStringLiteral(source),
  options: null,
  phase: null,
});

const makeImportExprDynamic = () => ({
  type: "ImportExpression" as const,
  source: { type: "Identifier", name: "modulePath" },
  options: null,
  phase: null,
});

const makeExportNamed = (source: string, exportKind?: "value" | "type") => ({
  type: "ExportNamedDeclaration" as const,
  source: makeStringLiteral(source),
  exportKind,
  declaration: null,
  specifiers: [],
  attributes: [],
});

const makeExportNamedNoSource = () => ({
  type: "ExportNamedDeclaration" as const,
  source: null,
  exportKind: undefined,
  declaration: null,
  specifiers: [],
  attributes: [],
});

const makeExportAll = (source: string, exportKind?: "value" | "type") => ({
  type: "ExportAllDeclaration" as const,
  source: makeStringLiteral(source),
  exportKind,
  exported: null,
  attributes: [],
});

const DEFAULT_OPTIONS = [
  {
    forbidden: [
      "@cat/db",
      "@cat/domain",
      "@cat/plugin-core",
      "hono",
      "@hono/node-ws",
    ],
    allowed: ["@cat/plugin-core/client"],
    allowTypeImports: true,
  },
];

describe("no-server-import", () => {
  describe("ImportDeclaration", () => {
    it("报告 forbidden 包的值导入", () => {
      const ctx = createMockContext(DEFAULT_OPTIONS);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const visitors = noServerImport.create(ctx as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      visitors.ImportDeclaration!(makeImportDecl("@cat/db") as any);
      expect(ctx.report).toHaveBeenCalledOnce();
      expect(ctx.report).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("@cat/db"),
        }),
      );
    });

    it("匹配 forbidden 包的子路径 (e.g. @cat/db/schema)", () => {
      const ctx = createMockContext(DEFAULT_OPTIONS);
      const visitors = noServerImport.create(ctx as any);
      visitors.ImportDeclaration!(makeImportDecl("@cat/db/schema") as any);
      expect(ctx.report).toHaveBeenCalledOnce();
    });

    it("不报告 allowed 子路径", () => {
      const ctx = createMockContext(DEFAULT_OPTIONS);
      const visitors = noServerImport.create(ctx as any);
      visitors.ImportDeclaration!(
        makeImportDecl("@cat/plugin-core/client") as any,
      );
      expect(ctx.report).not.toHaveBeenCalled();
    });

    it("不报告 type-only 导入（allowTypeImports=true）", () => {
      const ctx = createMockContext(DEFAULT_OPTIONS);
      const visitors = noServerImport.create(ctx as any);
      visitors.ImportDeclaration!(makeImportDecl("@cat/db", "type") as any);
      expect(ctx.report).not.toHaveBeenCalled();
    });

    it("allowTypeImports=false 时报告 type 导入", () => {
      const ctx = createMockContext([
        { ...DEFAULT_OPTIONS[0], allowTypeImports: false },
      ]);
      const visitors = noServerImport.create(ctx as any);
      visitors.ImportDeclaration!(makeImportDecl("@cat/db", "type") as any);
      expect(ctx.report).toHaveBeenCalledOnce();
    });

    it("不报告不在 forbidden 中的包", () => {
      const ctx = createMockContext(DEFAULT_OPTIONS);
      const visitors = noServerImport.create(ctx as any);
      visitors.ImportDeclaration!(makeImportDecl("vue") as any);
      expect(ctx.report).not.toHaveBeenCalled();
    });

    it("forbidden 为空时返回空 visitor", () => {
      const ctx = createMockContext([{ forbidden: [] }]);
      const visitors = noServerImport.create(ctx as any);
      expect(visitors.ImportDeclaration).toBeUndefined();
    });
  });

  describe("ImportExpression", () => {
    it("报告动态导入 forbidden 包", () => {
      const ctx = createMockContext(DEFAULT_OPTIONS);
      const visitors = noServerImport.create(ctx as any);
      visitors.ImportExpression!(makeImportExpr("hono") as any);
      expect(ctx.report).toHaveBeenCalledOnce();
      expect(ctx.report).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("hono"),
        }),
      );
    });

    it("不报告非字面量动态导入", () => {
      const ctx = createMockContext(DEFAULT_OPTIONS);
      const visitors = noServerImport.create(ctx as any);
      visitors.ImportExpression!(makeImportExprDynamic() as any);
      expect(ctx.report).not.toHaveBeenCalled();
    });
  });

  describe("ExportNamedDeclaration", () => {
    it("报告从 forbidden 包的 re-export", () => {
      const ctx = createMockContext(DEFAULT_OPTIONS);
      const visitors = noServerImport.create(ctx as any);
      visitors.ExportNamedDeclaration!(makeExportNamed("@cat/domain") as any);
      expect(ctx.report).toHaveBeenCalledOnce();
    });

    it("不报告无 source 的 export", () => {
      const ctx = createMockContext(DEFAULT_OPTIONS);
      const visitors = noServerImport.create(ctx as any);
      visitors.ExportNamedDeclaration!(makeExportNamedNoSource() as any);
      expect(ctx.report).not.toHaveBeenCalled();
    });
  });

  describe("ExportAllDeclaration", () => {
    it("报告 export * from forbidden 包", () => {
      const ctx = createMockContext(DEFAULT_OPTIONS);
      const visitors = noServerImport.create(ctx as any);
      visitors.ExportAllDeclaration!(makeExportAll("@cat/domain") as any);
      expect(ctx.report).toHaveBeenCalledOnce();
    });

    it("不报告 type re-export（allowTypeImports=true）", () => {
      const ctx = createMockContext(DEFAULT_OPTIONS);
      const visitors = noServerImport.create(ctx as any);
      visitors.ExportAllDeclaration!(
        makeExportAll("@cat/domain", "type") as any,
      );
      expect(ctx.report).not.toHaveBeenCalled();
    });
  });
});
