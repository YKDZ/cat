import { describe, expect, it } from "vitest";

import {
  auditWorkspacePackages,
  extractWorkspaceImports,
  loadWorkspacePackages,
  runNativeTurboBoundaries,
  type WorkspacePackage,
} from "./workspace-boundaries.ts";

const approvedFixtures: WorkspacePackage[] = [
  "@cat/app",
  "@cat/app-e2e",
  "@cat/domain",
  "@cat/eval",
  "@cat/seed",
  "@cat/test-utils",
  "@tools/seeder",
].map((name) => ({
  manifestPath: `${name}/package.json`,
  manifest: { name, dependencies: { "@cat/db": "workspace:*" } },
  tags: ["database-consumer", "database-path"],
}));

const workspaceRoot = ".";

describe("workspace database boundaries", () => {
  it("reports a native Turbo boundary command terminated by a signal", () => {
    expect(() =>
      runNativeTurboBoundaries("/workspace", () => ({
        signal: "SIGTERM",
        status: null,
      })),
    ).toThrow("turbo boundaries terminated by signal SIGTERM");
  });

  it("accepts the classified repository with exactly seven consumers", () => {
    expect(
      auditWorkspacePackages(loadWorkspacePackages(workspaceRoot)),
    ).toEqual([]);
  });

  it("classifies the CLI on the database path without granting direct access", () => {
    const cli = loadWorkspacePackages(workspaceRoot).find(
      ({ manifest }) => manifest.name === "@cat/cli",
    );

    expect(cli?.tags).toContain("database-path");
    expect(cli?.manifest.dependencies?.["@cat/db"]).toBeUndefined();
  });

  it.each([
    ["ordinary server", "@cat/new-server", ["server"]],
    ["untagged package", "@cat/new-package", []],
    ["plugin", "@cat-plugin/new-plugin", ["plugin"]],
  ])("rejects @cat/db from an %s", (_label, name, tags) => {
    const errors = auditWorkspacePackages([
      ...approvedFixtures,
      {
        manifestPath: `${name}/package.json`,
        manifest: { name, dependencies: { "@cat/db": "workspace:*" } },
        tags,
      },
    ]);

    expect(errors.join("\n")).toContain(`${name} declares @cat/db`);
  });

  it("rejects incompatible package roles", () => {
    const errors = auditWorkspacePackages([
      {
        manifestPath: "@cat/invalid/package.json",
        manifest: { name: "@cat/invalid" },
        tags: ["application", "library"],
      },
      {
        manifestPath: "@cat/invalid-tool/package.json",
        manifest: { name: "@cat/invalid-tool" },
        tags: ["tool"],
      },
      {
        manifestPath: "@cat/invalid-consumer/package.json",
        manifest: { name: "@cat/invalid-consumer" },
        tags: ["database-consumer"],
      },
    ]);

    expect(errors).toEqual(
      expect.arrayContaining([
        "@cat/invalid application and library roles are mutually exclusive",
        "@cat/invalid-tool tool role must also declare data-tool",
        "@cat/invalid-consumer database-consumer role must also declare database-path",
      ]),
    );
  });

  it.each([
    ["static import", 'import "@cat/db/schema";'],
    ["dynamic import", 'await import("@cat/db/client");'],
    ["CommonJS require", 'require("@cat/db/query");'],
  ])("finds workspace subpath dependencies from a %s", (_label, source) => {
    expect(extractWorkspaceImports(source, new Set(["@cat/db"]))).toEqual([
      "@cat/db",
    ]);
  });

  it("rejects direct and transitive database paths found in source", () => {
    const errors = auditWorkspacePackages([
      ...approvedFixtures,
      {
        manifestPath: "@cat/db/package.json",
        manifest: { name: "@cat/db" },
        tags: ["database", "library", "server"],
      },
      {
        manifestPath: "@cat/source-import/package.json",
        manifest: { name: "@cat/source-import" },
        sourceImports: ["@cat/db"],
        tags: ["library", "server"],
      },
      {
        manifestPath: "@cat/transitive/package.json",
        manifest: {
          name: "@cat/transitive",
          dependencies: { "@cat/source-import": "workspace:*" },
        },
        tags: ["library", "server"],
      },
    ]);

    expect(errors.join("\n")).toContain(
      "@cat/source-import imports @cat/db but is not an approved database consumer",
    );
    expect(errors.join("\n")).toContain(
      "@cat/transitive reaches @cat/db transitively but is missing the database-path Turbo tag",
    );
  });

  it.each([
    ["library", "application"],
    ["product-runtime", "test-infrastructure"],
    ["public-sdk", "application"],
    ["browser", "server"],
    ["server", "browser"],
    ["plugin", "database"],
    ["test-infrastructure", "application"],
    ["application", "application"],
    ["tool", "plugin"],
  ])("rejects a %s dependency on %s", (sourceRole, targetRole) => {
    const source = `@cat/${sourceRole}-source`;
    const target = `@cat/${targetRole}-target`;
    const errors = auditWorkspacePackages([
      ...approvedFixtures,
      {
        manifestPath: `${source}/package.json`,
        manifest: { name: source, dependencies: { [target]: "workspace:*" } },
        tags: [sourceRole],
      },
      {
        manifestPath: `${target}/package.json`,
        manifest: { name: target },
        tags: [targetRole],
      },
    ]);

    expect(errors.join("\n")).toContain(
      `${source} ${sourceRole} role cannot depend on ${targetRole} package ${target}`,
    );
  });
});
