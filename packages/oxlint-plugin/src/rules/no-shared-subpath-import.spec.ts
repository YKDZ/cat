import { describe, expect, it, vi } from "vitest";

import { noSharedSubpathImport } from "./no-shared-subpath-import.ts";

type MockContext = {
  options: unknown[];
  report: ReturnType<typeof vi.fn>;
};

const createMockContext = (): MockContext => ({
  options: [],
  report: vi.fn(),
});

const makeStringLiteral = (value: string) => ({
  type: "Literal" as const,
  value,
  raw: `"${value}"`,
});

const makeImportDecl = (source: string) => ({
  type: "ImportDeclaration" as const,
  source: makeStringLiteral(source),
  importKind: undefined,
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

const makeExportNamed = (source: string) => ({
  type: "ExportNamedDeclaration" as const,
  source: makeStringLiteral(source),
  exportKind: undefined,
  declaration: null,
  specifiers: [],
  attributes: [],
});

const makeExportAll = (source: string) => ({
  type: "ExportAllDeclaration" as const,
  source: makeStringLiteral(source),
  exportKind: undefined,
  exported: null,
  attributes: [],
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runVisitor(ctx: MockContext, node: any) {
  const visitors = noSharedSubpathImport.create(ctx as never);
  const handler = visitors[node.type as keyof typeof visitors];
  if (handler) (handler as (n: unknown) => void)(node);
}

describe("no-shared-subpath-import", () => {
  describe("flags subpath imports", () => {
    it("flags ImportDeclaration with @cat/shared subpath", () => {
      const ctx = createMockContext();
      runVisitor(ctx, makeImportDecl("@cat/shared/schema/agent"));
      expect(ctx.report).toHaveBeenCalledOnce();
      expect(ctx.report.mock.calls[0][0].message).toContain("@cat/shared");
    });

    it("flags ImportExpression with @cat/shared subpath", () => {
      const ctx = createMockContext();
      runVisitor(ctx, makeImportExpr("@cat/shared/utils"));
      expect(ctx.report).toHaveBeenCalledOnce();
    });

    it("flags ExportNamedDeclaration re-export with @cat/shared subpath", () => {
      const ctx = createMockContext();
      runVisitor(ctx, makeExportNamed("@cat/shared/schema/enum"));
      expect(ctx.report).toHaveBeenCalledOnce();
    });

    it("flags ExportAllDeclaration with @cat/shared subpath", () => {
      const ctx = createMockContext();
      runVisitor(ctx, makeExportAll("@cat/shared/schema/drizzle/agent"));
      expect(ctx.report).toHaveBeenCalledOnce();
    });
  });

  describe("allows root imports", () => {
    it("allows exact @cat/shared root import", () => {
      const ctx = createMockContext();
      runVisitor(ctx, makeImportDecl("@cat/shared"));
      expect(ctx.report).not.toHaveBeenCalled();
    });

    it("allows unrelated package imports", () => {
      const ctx = createMockContext();
      runVisitor(ctx, makeImportDecl("@cat/db"));
      expect(ctx.report).not.toHaveBeenCalled();
    });

    it("allows relative imports", () => {
      const ctx = createMockContext();
      runVisitor(ctx, makeImportDecl("./schema/agent.ts"));
      expect(ctx.report).not.toHaveBeenCalled();
    });
  });
});
