import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const docsRoot = resolve(import.meta.dirname, "../apps/docs/src");
const developerRoot = resolve(docsRoot, "developer");

const requiredTopics = [
  {
    file: "plugin-lifecycle.md",
    title: "Plugin Lifecycle",
    terms: ["manifest", "service", "component", "lifecycle"],
  },
  {
    file: "vcs-branch-isolation.md",
    title: "VCS Branch Isolation",
    terms: ["branch", "isolation", "workspace", "merge"],
  },
  {
    file: "term-recall.md",
    title: "Term Recall",
    terms: ["glossary", "term", "range", "rerank"],
  },
  {
    file: "memory-recall.md",
    title: "Memory Recall",
    terms: ["translation memory", "context", "ranking", "candidate"],
  },
  {
    file: "automatic-translation.md",
    title: "Automatic Translation",
    terms: ["provider", "trace", "suggestion", "graceful"],
  },
  {
    file: "qa-review.md",
    title: "QA Review",
    terms: ["queue", "annotation", "decision", "finding"],
  },
  {
    file: "agent-runtime.md",
    title: "Agent Runtime",
    terms: ["runtime", "session", "tool", "approval"],
  },
] as const;

const generatedDocMarkers = [
  "## Symbols",
  "## Package",
  "## Function Index",
  "## Type Index",
  "Reference Health",
  "Source Inventory",
  "references.json",
  "findings.json",
  "subjects.json",
  "# @cat/",
  "/workspaces/cat",
] as const;

const readDocsFile = (relativePath: string) =>
  readFile(resolve(docsRoot, relativePath), "utf8");

const routeExists = async (route: string) => {
  const routePath = route.replace(/\/$/u, "/index");
  await access(resolve(docsRoot, `${routePath.replace(/^\//u, "")}.md`));
};

describe("developer documentation", () => {
  it("publishes hand-written system-topic docs for the migrated semantic topics", async () => {
    for (const topic of requiredTopics) {
      const content = await readFile(
        resolve(developerRoot, topic.file),
        "utf8",
      );

      expect(content).toContain(`# ${topic.title}`);
      expect(content).not.toMatch(/[\u3400-\u9fff]/u);
      expect(content).not.toMatch(/@(?:zh|en)\b/u);

      for (const term of topic.terms) {
        expect(content.toLowerCase()).toContain(term);
      }

      for (const marker of generatedDocMarkers) {
        expect(content).not.toContain(marker);
      }

      expect(content).not.toMatch(/(?:^|\s)packages\/[\w./-]+/u);
      expect(content).not.toMatch(/:L\d+\b/u);
    }
  });

  it("makes developer docs the docs app entry point instead of AutoDoc", async () => {
    const homepage = await readDocsFile("index.md");
    const vitepressConfig = await readDocsFile(".vitepress/config.ts");

    expect(homepage).toContain("link: /developer/");
    expect(homepage).not.toContain("/autodoc/");

    expect(vitepressConfig).toContain('link: "/developer/');
    expect(vitepressConfig).not.toContain("/autodoc/");
    expect(vitepressConfig).not.toContain("AutoDoc");
    expect(vitepressConfig).not.toContain("/user/intro");

    for (const topic of requiredTopics) {
      const route = `/developer/${topic.file.replace(/\.md$/u, "")}`;
      expect(vitepressConfig).toContain(route);
    }
  });

  it("points homepage and navigation links at existing docs pages", async () => {
    const homepage = await readDocsFile("index.md");
    const vitepressConfig = await readDocsFile(".vitepress/config.ts");
    const linkedRoutes = [
      ...homepage.matchAll(/link: (\/[\w/-]+)/gu),
      ...vitepressConfig.matchAll(/link: "(\/[\w/-]+)"/gu),
    ].map((match) => match[1]);

    await Promise.all(linkedRoutes.map((route) => routeExists(route)));
  });
});
