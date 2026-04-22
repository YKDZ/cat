import type { AutodocConfig } from "@tools/autodoc";

export const sections = [
  {
    id: "domain",
    title: { zh: "领域模型", en: "Domain Model" },
    order: 1,
    public: true,
  },
  {
    id: "infra",
    title: { zh: "基础设施", en: "Infra" },
    order: 2,
    public: true,
  },
  {
    id: "services",
    title: { zh: "服务", en: "Services" },
    order: 3,
    public: true,
  },
  {
    id: "ai",
    title: { zh: "AI 系统", en: "AI System" },
    order: 4,
    public: true,
  },
] as const satisfies AutodocConfig["sections"];

export default {
  packages: [
    {
      path: "packages/domain",
      name: "@cat/domain",
      priority: "high",
      include: ["src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.spec.ts"],
    },
    {
      path: "packages/operations",
      name: "@cat/operations",
      priority: "high",
      include: ["src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.spec.ts"],
    },
    { path: "packages/shared", name: "@cat/shared", priority: "medium" },
    { path: "packages/db", name: "@cat/db", priority: "medium" },
    {
      path: "packages/permissions",
      name: "@cat/permissions",
      priority: "medium",
    },
    { path: "packages/workflow", name: "@cat/workflow", priority: "medium" },
    {
      path: "packages/server-shared",
      name: "@cat/server-shared",
      priority: "medium",
    },
    {
      path: "packages/plugin-core",
      name: "@cat/plugin-core",
      priority: "medium",
    },
    {
      path: "packages/auth",
      name: "@cat/auth",
      priority: "medium",
    },
    {
      path: "packages/core",
      name: "@cat/core",
      priority: "medium",
    },
    {
      path: "packages/message",
      name: "@cat/message",
      priority: "medium",
    },
    {
      path: "packages/graph",
      name: "@cat/graph",
      priority: "medium",
    },
    {
      path: "packages/agent",
      name: "@cat/agent",
      priority: "medium",
    },
    {
      path: "packages/agent-tools",
      name: "@cat/agent-tools",
      priority: "medium",
    },
    {
      path: "packages/vcs",
      name: "@cat/vcs",
      priority: "medium",
    },
    {
      path: "packages/file-parsers",
      name: "@cat/file-parsers",
      priority: "low",
    },
    {
      path: "packages/seed",
      name: "@cat/seed",
      priority: "low",
    },
    {
      path: "packages/source-collector",
      name: "@cat/source-collector",
      priority: "low",
    },
    {
      path: "packages/screenshot-collector",
      name: "@cat/screenshot-collector",
      priority: "low",
    },
    {
      path: "apps/eval",
      name: "@cat/eval",
      priority: "low",
    },
  ],
  output: {
    path: "apps/docs/src/autodoc",
    format: "markdown",
  },
  project: {
    name: "CAT",
    summary:
      "A secure, efficient, and easily extensible self-hosted Computer-Assisted Translation web application.",
  },
  packageDocs: {
    stripPrefix: "@cat/",
  },
  readmeGlobs: ["packages/*/README.md", "apps/*/README.md"],
  overview: {
    title: "CAT Project Module Overview",
    sections: [
      {
        type: "links",
        heading: "Apps",
        items: [
          {
            label: "@cat/app",
            description: "apps/app — Main app (Vue 3 SSR + Vike)",
          },
          {
            label: "@cat/app-api",
            description: "apps/app-api — API layer (Hono + oRPC)",
          },
          {
            label: "@cat/docs",
            description: "apps/docs — Documentation site (VitePress)",
          },
        ],
      },
      {
        type: "packages",
        heading: "Core Packages",
        priorities: ["high", "medium", "low"],
      },
      {
        type: "code",
        heading: "Core Package Dependencies",
        language: "",
        content: [
          "operations → domain → db → shared",
          "permissions → db → shared",
          "agent → operations → domain",
        ].join("\n"),
      },
    ],
  },
  llmsTxt: {
    enabled: true,
    title: "CAT",
    summary:
      "A secure, efficient, and easily extensible self-hosted Computer-Assisted Translation web application.",
    projectInfo: [
      "Tech stack: TypeScript, Vue 3, Hono, Drizzle ORM, PostgreSQL",
      "License: GPL-3.0-only (main app), MIT (packages/plugins)",
    ],
    featuredPackages: [
      {
        package: "@cat/domain",
        summary:
          "Domain layer using CQRS pattern. Commands mutate state, Queries read data.",
        stats: [
          { label: "Commands", kinds: ["function"], pathIncludes: "commands/" },
          { label: "Queries", kinds: ["function"], pathIncludes: "queries/" },
        ],
      },
      {
        package: "@cat/operations",
        summary:
          "Operations layer composing domain operations. Functions use `Op` suffix with Zod schema input validation.",
        stats: [],
      },
    ],
  },
  catalog: {
    directory: "agent",
    subjectsFile: "subjects.json",
    referencesFile: "references.json",
    findingsFile: "findings.json",
  },
  validation: {
    semantic: {
      validatePrimaryLanguage: false,
    },
  },
  subjects: [
    "packages/*/*.subject.ts",
    "apps/docs/src/.vitepress/autodoc/sections/*.subject.ts",
  ],
  sections,
  fragments: ["**/*.semantic.md"],
  structuredAssets: [],
} satisfies AutodocConfig;
