import { Project } from "ts-morph";
import { describe, it, expect } from "vitest";

import { createSymbolExtractor } from "./symbol-extractor.js";

const ROOT = "/fake/root";

const makeProject = (code: string, fileName = "src/index.ts") => {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile(`${ROOT}/${fileName}`, code);
  return { project, sourceFile };
};

describe("createSymbolExtractor", () => {
  const extractor = createSymbolExtractor("@cat/test", ROOT);

  describe("extractModuleInfo - exported arrow functions", () => {
    it("extracts an exported arrow function with description", () => {
      const { sourceFile } = makeProject(`
/**
 * @zh 创建项目
 * @en Creates a project
 */
export const createProject = (name: string): string => name;
`);
      const mod = extractor.extractModuleInfo(sourceFile);
      expect(mod.symbols).toHaveLength(1);
      const sym = mod.symbols[0];
      expect(sym.name).toBe("createProject");
      expect(sym.kind).toBe("function");
      expect(sym.description).toBe("Creates a project");
      expect(sym.isExported).toBe(true);
      expect(sym.id).toMatch(/^@cat\/test:.+:createProject$/);
    });

    it("does not extract non-exported arrow function", () => {
      const { sourceFile } = makeProject(`
const helper = (x: number) => x * 2;
`);
      const mod = extractor.extractModuleInfo(sourceFile);
      expect(mod.symbols).toHaveLength(0);
    });

    it("extracts async arrow function and marks isAsync", () => {
      const { sourceFile } = makeProject(`
/** @en Async fetch */
export const fetchData = async (url: string): Promise<string> => {
  return url;
};
`);
      const mod = extractor.extractModuleInfo(sourceFile);
      expect(mod.symbols).toHaveLength(1);
      expect(mod.symbols[0].isAsync).toBe(true);
    });

    it("extracts combined signature for arrow functions with type annotation", () => {
      const { sourceFile } = makeProject(`
        type MyFn<T> = (ctx: { db: string }, input: T) => Promise<{ result: T }>;
        export const myFunction: MyFn<string> = async (ctx, input) => {
          return { result: input };
        };
      `);
      const mod = extractor.extractModuleInfo(sourceFile);
      const sym = mod.symbols.find((s) => s.name === "myFunction");
      expect(sym).toBeDefined();
      expect(sym!.rawDeclaration).toBe("export const myFunction: MyFn<string>");
      expect(sym!.signature).toBe(
        "export const myFunction: MyFn<string> = async (ctx: { db: string; }, input: string) => {...}",
      );
    });

    it("preserves inline type annotations in combined signature params", () => {
      const { sourceFile } = makeProject(`
        type Handler<T> = (ctx: { db: string }, data: T) => void;
        export const handle: Handler<number> = (ctx: { db: string }, data: number) => {};
      `);
      const mod = extractor.extractModuleInfo(sourceFile);
      const sym = mod.symbols.find((s) => s.name === "handle");
      expect(sym).toBeDefined();
      expect(sym!.signature).toBe(
        "export const handle: Handler<number> = (ctx: { db: string }, data: number) => {...}",
      );
    });

    it("does not set rawDeclaration for arrow functions without type annotation", () => {
      const { sourceFile } = makeProject(`
        export const simpleFunc = (name: string): string => name;
      `);
      const mod = extractor.extractModuleInfo(sourceFile);
      const sym = mod.symbols.find((s) => s.name === "simpleFunc");
      expect(sym).toBeDefined();
      expect(sym!.rawDeclaration).toBeUndefined();
      expect(sym!.signature).toContain("name: string");
    });

    it("extracts @returns with bilingual inline tags (dash prefix)", () => {
      const { sourceFile } = makeProject(`
/**
 * @zh 获取语言名称。
 * @en Get the language name.
 *
 * @param code - {@zh 语言代码} {@en BCP 47 language code}
 * @returns - {@zh 语言显示名称} {@en Display name of the language}
 */
export const getLanguageName = (code: string): string => code;
`);
      const mod = extractor.extractModuleInfo(sourceFile);
      expect(mod.symbols).toHaveLength(1);
      const sym = mod.symbols[0];
      expect(sym.description).toBe("Get the language name.");
      expect(sym.parameters![0].description).toBe("BCP 47 language code");
      expect(sym.returnDescription).toBe("Display name of the language");
    });

    it("strips dash prefix from monolingual @returns", () => {
      const { sourceFile } = makeProject(`
/**
 * @en Get name.
 * @returns - the computed name
 */
export const getName = (): string => "foo";
`);
      const mod = extractor.extractModuleInfo(sourceFile);
      const sym = mod.symbols[0];
      expect(sym.returnDescription).toBe("the computed name");
    });
  });

  describe("extractModuleInfo - function declarations", () => {
    it("extracts exported function declarations", () => {
      const { sourceFile } = makeProject(`
/** @en Compute sum */
export function sum(a: number, b: number): number {
  return a + b;
}
`);
      const mod = extractor.extractModuleInfo(sourceFile);
      expect(mod.symbols.some((s) => s.name === "sum")).toBe(true);
    });

    it("does not extract non-exported function declarations", () => {
      const { sourceFile } = makeProject(`
function internal(x: string): void {}
`);
      const mod = extractor.extractModuleInfo(sourceFile);
      expect(mod.symbols).toHaveLength(0);
    });

    it("extracts @returns with dash prefix for function declarations", () => {
      const { sourceFile } = makeProject(`
/**
 * @zh 计算总和。
 * @en Compute sum.
 *
 * @param a - {@zh 第一个数} {@en First number}
 * @param b - {@zh 第二个数} {@en Second number}
 * @returns - {@zh 两数之和} {@en Sum of the two numbers}
 */
export function sum(a: number, b: number): number {
  return a + b;
}
`);
      const mod = extractor.extractModuleInfo(sourceFile);
      const sym = mod.symbols.find((s) => s.name === "sum");
      expect(sym).toBeDefined();
      expect(sym!.returnDescription).toBe("Sum of the two numbers");
      expect(sym!.parameters![0].description).toBe("First number");
      expect(sym!.parameters![1].description).toBe("Second number");
    });
  });

  describe("extractModuleInfo - interfaces", () => {
    it("extracts exported interface with properties", () => {
      const { sourceFile } = makeProject(`
/**
 * @en User record
 */
export interface User {
  /** @en User name */
  name: string;
  /** @en User age */
  age?: number;
}
`);
      const mod = extractor.extractModuleInfo(sourceFile);
      expect(mod.symbols).toHaveLength(1);
      const sym = mod.symbols[0];
      expect(sym.kind).toBe("interface");
      expect(sym.name).toBe("User");
      expect(sym.description).toBe("User record");
      expect(sym.properties).toHaveLength(2);
      expect(sym.properties![1].optional).toBe(true);
    });

    it("does not extract non-exported interface", () => {
      const { sourceFile } = makeProject(`
interface Internal {}
`);
      const mod = extractor.extractModuleInfo(sourceFile);
      expect(mod.symbols).toHaveLength(0);
    });
  });

  describe("extractModuleInfo - type aliases", () => {
    it("extracts exported type alias", () => {
      const { sourceFile } = makeProject(`
/** @en Status union */
export type Status = "active" | "inactive";
`);
      const mod = extractor.extractModuleInfo(sourceFile);
      expect(mod.symbols).toHaveLength(1);
      expect(mod.symbols[0].kind).toBe("type");
      expect(mod.symbols[0].name).toBe("Status");
    });
  });

  describe("extractModuleInfo - enums", () => {
    it("extracts exported enum", () => {
      const { sourceFile } = makeProject(`
/** @en Permission levels */
export enum Permission {
  Read = "read",
  Write = "write",
}
`);
      const mod = extractor.extractModuleInfo(sourceFile);
      expect(mod.symbols).toHaveLength(1);
      expect(mod.symbols[0].kind).toBe("enum");
      expect(mod.symbols[0].name).toBe("Permission");
    });
  });

  describe("sourceLocation", () => {
    it("records correct relative filePath and line numbers", () => {
      const { sourceFile } = makeProject(`
/** @en Func */
export const doThing = (): void => {};
`);
      const mod = extractor.extractModuleInfo(sourceFile);
      expect(mod.symbols).toHaveLength(1);
      const loc = mod.symbols[0].sourceLocation;
      // Should have stripped the ROOT prefix
      expect(loc.filePath).not.toContain(ROOT);
      expect(loc.line).toBeGreaterThanOrEqual(1);
      expect(loc.endLine).toBeGreaterThanOrEqual(loc.line);
    });
  });

  describe("symbol ID format", () => {
    it("generates ID in pkg:module/path:name format", () => {
      const { sourceFile } = makeProject(`
/** @en Test fn */
export const testFn = (): void => {};
`);
      const mod = extractor.extractModuleInfo(sourceFile);
      const sym = mod.symbols[0];
      // ID format: @cat/test:src/index:testFn
      expect(sym.id).toBe("@cat/test:src/index:testFn");
    });
  });
});
