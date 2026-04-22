import { describe, it, expect } from "vitest";

import {
  AutodocConfigSchema,
  SubjectManifestConfigSchema,
  PackageConfigSchema,
  PublicationMemberConfigSchema,
} from "./types.js";

// ── AutodocConfigSchema ───────────────────────────────────────────────────────

describe("AutodocConfigSchema", () => {
  const minimalConfig = {
    packages: [{ path: "packages/domain", name: "@cat/domain" }],
    output: { path: "apps/docs/src/autodoc", format: "markdown" },
    llmsTxt: { enabled: true },
  };

  it("parses a minimal config (legacy-compatible fields only)", () => {
    const result = AutodocConfigSchema.safeParse(minimalConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.packages).toHaveLength(1);
      expect(result.data.output.path).toBe("apps/docs/src/autodoc");
      expect(result.data.llmsTxt.enabled).toBe(true);
      // 2.0 fields absent — optional
      expect(result.data.subjects).toBeUndefined();
      expect(result.data.sections).toBeUndefined();
      expect(result.data.fragments).toBeUndefined();
      expect(result.data.structuredAssets).toBeUndefined();
    }
  });

  it("parses a full 2.0 config with all fields (file-path sections)", () => {
    const fullConfig = {
      ...minimalConfig,
      subjects: "packages/*/*.subject.ts",
      sections: "some-sections.config.ts",
      fragments: ["**/*.semantic.md"],
      structuredAssets: [
        { package: "@cat/domain", file: "packages/domain/src/schemas.ts" },
      ],
    };
    const result = AutodocConfigSchema.safeParse(fullConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subjects).toBe("packages/*/*.subject.ts");
      expect(result.data.sections).toBe("some-sections.config.ts");
      expect(result.data.fragments).toEqual(["**/*.semantic.md"]);
      expect(result.data.structuredAssets).toHaveLength(1);
    }
  });

  it("accepts sections as an inline array", () => {
    const inlineSections = [
      {
        id: "domain",
        title: { zh: "领域", en: "Domain" },
        order: 1,
        public: true,
      },
      {
        id: "services",
        title: { zh: "服务", en: "Services" },
        order: 2,
        public: true,
      },
    ];
    const result = AutodocConfigSchema.safeParse({
      ...minimalConfig,
      sections: inlineSections,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Array.isArray(result.data.sections)).toBe(true);
      expect(result.data.sections).toHaveLength(2);
    }
  });

  it("accepts subjects as an array of glob patterns", () => {
    const result = AutodocConfigSchema.safeParse({
      ...minimalConfig,
      subjects: [
        "packages/*/*.subject.ts",
        "apps/docs/src/.vitepress/autodoc/sections/*.subject.ts",
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Array.isArray(result.data.subjects)).toBe(true);
    }
  });

  it("applies default output.path when not specified", () => {
    const result = AutodocConfigSchema.safeParse({
      packages: [],
      output: {},
      llmsTxt: { enabled: false },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.output.path).toBe("autodoc");
      expect(result.data.output.format).toBe("markdown");
    }
  });

  it("applies default priority 'medium' when not specified", () => {
    const result = AutodocConfigSchema.safeParse({
      packages: [{ path: "packages/shared", name: "@cat/shared" }],
      output: {},
      llmsTxt: { enabled: true },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.packages[0]?.priority).toBe("medium");
    }
  });

  it("fails when packages field is missing", () => {
    const result = AutodocConfigSchema.safeParse({
      output: { path: "out" },
      llmsTxt: { enabled: true },
    });
    expect(result.success).toBe(false);
  });

  it("fails when package priority is an invalid enum value", () => {
    const result = AutodocConfigSchema.safeParse({
      packages: [{ path: "p", name: "n", priority: "critical" }],
      output: {},
      llmsTxt: { enabled: true },
    });
    expect(result.success).toBe(false);
  });

  it("fails when output format is invalid", () => {
    const result = AutodocConfigSchema.safeParse({
      packages: [],
      output: { format: "yaml" },
      llmsTxt: { enabled: true },
    });
    expect(result.success).toBe(false);
  });

  it("fails when structuredAssets entry is missing required fields", () => {
    const result = AutodocConfigSchema.safeParse({
      ...minimalConfig,
      structuredAssets: [{ package: "@cat/domain" }], // missing 'file'
    });
    expect(result.success).toBe(false);
  });

  it("parses configurable projections, catalog paths, and semantic validation", () => {
    const result = AutodocConfigSchema.safeParse({
      packages: [{ path: "packages/domain", name: "@acme/domain" }],
      output: {},
      project: {
        name: "Acme Platform",
        summary: "Internal documentation compiler.",
      },
      packageDocs: {
        stripPrefix: "@acme/",
      },
      readmeGlobs: ["packages/*/README.md", "apps/*/README.md"],
      overview: {
        title: "Acme Platform Overview",
        sections: [
          {
            type: "links",
            heading: "Apps",
            items: [
              {
                label: "@acme/web",
                description: "apps/web — Web frontend",
              },
            ],
          },
          {
            type: "packages",
            heading: "Core Packages",
            priorities: ["high", "medium"],
          },
          {
            type: "code",
            heading: "Dependencies",
            content: "web → api → domain",
          },
        ],
      },
      llmsTxt: {
        enabled: true,
        title: "Acme Docs",
        summary: "Workspace documentation bundle.",
        projectInfo: ["Tech stack: TypeScript, Hono"],
        featuredPackages: [
          {
            package: "@acme/domain",
            summary: "Domain rules and business operations.",
            stats: [
              {
                label: "Commands",
                kinds: ["function"],
                pathIncludes: "commands/",
              },
            ],
          },
        ],
      },
      catalog: {
        directory: "catalog",
        subjectsFile: "subjects.json",
        referencesFile: "refs.json",
        findingsFile: "findings.json",
      },
      validation: {
        semantic: {
          validatePrimaryLanguage: false,
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("fails when overview section type is unknown", () => {
    const result = AutodocConfigSchema.safeParse({
      packages: [],
      output: {},
      llmsTxt: { enabled: false },
      overview: {
        sections: [{ type: "table", heading: "Bad" }],
      },
    });

    expect(result.success).toBe(false);
  });

  it("fails when llmsTxt featured package stats are missing labels", () => {
    const result = AutodocConfigSchema.safeParse({
      packages: [],
      output: {},
      llmsTxt: {
        enabled: true,
        featuredPackages: [
          { package: "@acme/domain", summary: "x", stats: [{}] },
        ],
      },
    });

    expect(result.success).toBe(false);
  });
});

// ── PackageConfigSchema ───────────────────────────────────────────────────────

describe("PackageConfigSchema", () => {
  it("parses a full package config", () => {
    const result = PackageConfigSchema.safeParse({
      path: "packages/domain",
      name: "@cat/domain",
      priority: "high",
      include: ["src/**/*.ts"],
      exclude: ["**/*.test.ts"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe("high");
      expect(result.data.include).toEqual(["src/**/*.ts"]);
    }
  });

  it("fails without required path", () => {
    const result = PackageConfigSchema.safeParse({ name: "@cat/domain" });
    expect(result.success).toBe(false);
  });
});

// ── PublicationMemberConfigSchema ─────────────────────────────────────────────

describe("PublicationMemberConfigSchema", () => {
  it("parses a package member", () => {
    const result = PublicationMemberConfigSchema.safeParse({
      type: "package",
      ref: "@cat/domain",
    });
    expect(result.success).toBe(true);
  });

  it("parses a zodSchema member", () => {
    const result = PublicationMemberConfigSchema.safeParse({
      type: "zodSchema",
      ref: "src/schemas.ts:MySchema",
    });
    expect(result.success).toBe(true);
  });

  it("fails on unknown member type", () => {
    const result = PublicationMemberConfigSchema.safeParse({
      type: "module",
      ref: "@cat/domain",
    });
    expect(result.success).toBe(false);
  });
});

// ── SubjectManifestConfigSchema ───────────────────────────────────────────────

describe("SubjectManifestConfigSchema", () => {
  const validManifest = {
    id: "domain",
    title: { zh: "领域模型", en: "Domain Model" },
    section: "domain",
    primaryOwner: "@cat/domain",
  };

  it("parses a minimal manifest with defaults applied", () => {
    const result = SubjectManifestConfigSchema.safeParse(validManifest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.secondaryAssociations).toEqual([]);
      expect(result.data.members).toEqual([]);
      expect(result.data.semanticFragments).toEqual([]);
      expect(result.data.dependsOn).toEqual([]);
      expect(result.data.public).toBe(true);
    }
  });

  it("parses a full manifest", () => {
    const result = SubjectManifestConfigSchema.safeParse({
      ...validManifest,
      secondaryAssociations: ["@cat/operations"],
      members: [{ type: "package", ref: "@cat/domain" }],
      semanticFragments: ["packages/domain/README.md#overview"],
      dependsOn: ["infrastructure"],
      public: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.secondaryAssociations).toEqual(["@cat/operations"]);
      expect(result.data.members).toHaveLength(1);
    }
  });

  it("fails when id is empty string", () => {
    const result = SubjectManifestConfigSchema.safeParse({
      ...validManifest,
      id: "",
    });
    expect(result.success).toBe(false);
  });

  it("fails when section is missing", () => {
    const result = SubjectManifestConfigSchema.safeParse({
      id: "domain",
      title: { zh: "a", en: "b" },
      primaryOwner: "@cat/domain",
    });
    expect(result.success).toBe(false);
  });

  it("fails when title is missing the zh key", () => {
    const result = SubjectManifestConfigSchema.safeParse({
      ...validManifest,
      title: { en: "Domain Model" },
    });
    expect(result.success).toBe(false);
  });

  it("fails when members contain an invalid type", () => {
    const result = SubjectManifestConfigSchema.safeParse({
      ...validManifest,
      members: [{ type: "invalid", ref: "@cat/domain" }],
    });
    expect(result.success).toBe(false);
  });
});
