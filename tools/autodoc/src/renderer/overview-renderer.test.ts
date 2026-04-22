import { describe, expect, it } from "vitest";

import { AutodocConfigSchema } from "../types.js";
import { createOverviewRenderer } from "./overview-renderer.js";

const config = AutodocConfigSchema.parse({
  packages: [
    { path: "packages/domain", name: "@acme/domain", priority: "high" },
  ],
  output: {},
  packageDocs: { stripPrefix: "@acme/" },
  overview: {
    title: "Acme Platform Overview",
    sections: [
      {
        type: "links",
        heading: "Apps",
        items: [{ label: "@acme/web", description: "apps/web — Web frontend" }],
      },
      {
        type: "packages",
        heading: "Core Packages",
        priorities: ["high"],
      },
      {
        type: "code",
        heading: "Dependencies",
        content: "web → api → domain",
      },
    ],
  },
  llmsTxt: { enabled: false },
});

const packages = [
  {
    name: "@acme/domain",
    path: "/repo/packages/domain",
    description: "Business rules",
    priority: "high" as const,
    modules: [{ relativePath: "src/index.ts", symbols: [] }],
  },
];

describe("createOverviewRenderer", () => {
  it("renders configured links, package section, and code block", () => {
    const output = createOverviewRenderer(config).render(packages);

    expect(output).toContain("# Acme Platform Overview");
    expect(output).toContain("## Apps");
    expect(output).toContain("**@acme/web** — apps/web — Web frontend");
    expect(output).toContain("[**@acme/domain**](./packages/domain.md)");
    expect(output).toContain("## Dependencies");
    expect(output).toContain("web → api → domain");
  });
});
