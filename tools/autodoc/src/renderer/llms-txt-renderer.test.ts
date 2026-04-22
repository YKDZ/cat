import { describe, expect, it } from "vitest";

import type { SourceLocation, SymbolIR } from "../ir.js";

import { AutodocConfigSchema } from "../types.js";
import { createLlmsTxtRenderer } from "./llms-txt-renderer.js";

const config = AutodocConfigSchema.parse({
  packages: [
    { path: "packages/domain", name: "@acme/domain", priority: "high" },
  ],
  output: {},
  project: {
    name: "Acme",
    summary: "Workspace documentation bundle.",
  },
  packageDocs: { stripPrefix: "@acme/" },
  readmeGlobs: ["packages/*/README.md"],
  llmsTxt: {
    enabled: true,
    projectInfo: ["Tech stack: TypeScript, Hono"],
    featuredPackages: [
      {
        package: "@acme/domain",
        summary: "Domain rules and business operations.",
        stats: [
          { label: "Commands", kinds: ["function"], pathIncludes: "commands/" },
        ],
      },
    ],
  },
});

const loc: SourceLocation = {
  filePath: "src/commands/create.ts",
  line: 1,
  endLine: 1,
};

const makeSym = (
  overrides: Partial<SymbolIR> & Pick<SymbolIR, "name">,
): SymbolIR => ({
  id: `@acme/domain:src/commands/create:${overrides.name}`,
  kind: "function",
  isAsync: false,
  isExported: true,
  sourceLocation: loc,
  ...overrides,
});

const packages = [
  {
    name: "@acme/domain",
    path: "/repo/packages/domain",
    description: "Business rules",
    priority: "high" as const,
    modules: [
      {
        relativePath: "src/commands/create.ts",
        symbols: [makeSym({ name: "createProject" })],
      },
    ],
  },
];

describe("createLlmsTxtRenderer", () => {
  it("renders project metadata and configured featured package stats", () => {
    const output = createLlmsTxtRenderer(config).render(packages);

    expect(output).toContain("# Acme");
    expect(output).toContain("> Workspace documentation bundle.");
    expect(output).toContain("- Tech stack: TypeScript, Hono");
    expect(output).toContain(
      "- [@acme/domain](./packages/domain.md): 1 exported functions — Business rules",
    );
    expect(output).toContain("## @acme/domain");
    expect(output).toContain("Domain rules and business operations.");
    expect(output).toContain("- Commands: 1");
  });
});
