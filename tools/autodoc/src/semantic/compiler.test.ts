import { describe, it, expect } from "vitest";

import type { SubjectRegistry } from "../subjects/registry.js";

import { buildSemanticCatalog } from "./compiler.js";
import {
  collectFragmentsFromString,
  parseSemanticMdFrontmatterPublic,
} from "./fragment-collector.js";

describe("collectFragmentsFromString (readme-anchor)", () => {
  it("collects a simple anchor fragment", () => {
    const md = `
# Package

<!-- autodoc:subject=workflow/core -->
这是工作流核心包的语义描述，包含任务调度与状态机。
<!-- autodoc:end -->

Other content.
`;
    const frags = collectFragmentsFromString(
      md,
      "packages/workflow/README.md",
      "readme-anchor",
    );
    expect(frags).toHaveLength(1);
    expect(frags[0].subjectId).toBe("workflow/core");
    expect(frags[0].sourcePath).toBe("packages/workflow/README.md");
    expect(frags[0].body).toContain("工作流核心");
    expect(frags[0].sourceType).toBe("readme-anchor");
  });

  it("collects multiple fragments from one file", () => {
    const md = `
<!-- autodoc:subject=pkg/a -->
A 的描述。
<!-- autodoc:end -->

<!-- autodoc:subject=pkg/b -->
B 的描述。
<!-- autodoc:end -->
`;
    const frags = collectFragmentsFromString(md, "README.md", "readme-anchor");
    expect(frags).toHaveLength(2);
    expect(frags.map((f) => f.subjectId)).toContain("pkg/a");
    expect(frags.map((f) => f.subjectId)).toContain("pkg/b");
  });

  it("returns empty when no anchors found", () => {
    const frags = collectFragmentsFromString(
      "# Hello",
      "README.md",
      "readme-anchor",
    );
    expect(frags).toHaveLength(0);
  });

  it("extracts stableKey references from fragment body", () => {
    const md = `
<!-- autodoc:subject=pkg/x -->
引用了 {@stableKey @cat/pkg:src/index:myFn} 函数。
<!-- autodoc:end -->
`;
    const frags = collectFragmentsFromString(md, "README.md", "readme-anchor");
    expect(frags[0].referencedStableKeys).toContain("@cat/pkg:src/index:myFn");
  });

  it("records correct start line for fragment", () => {
    const md = `line1\n<!-- autodoc:subject=pkg/x -->\ntext\n<!-- autodoc:end -->`;
    const frags = collectFragmentsFromString(md, "README.md", "readme-anchor");
    expect(frags[0].startLine).toBe(2);
  });
});

describe("parseSemanticMdFrontmatterPublic", () => {
  it("parses subject and title from front-matter", () => {
    const content = `---
subject: workflow/core
title: 工作流核心
---

这是工作流核心的语义描述。
`;
    const result = parseSemanticMdFrontmatterPublic(content);
    expect(result.subject).toBe("workflow/core");
    expect(result.title).toBe("工作流核心");
    expect(result.body).toContain("语义描述");
  });

  it("returns null subject when no front-matter", () => {
    const result = parseSemanticMdFrontmatterPublic("# No front-matter\n");
    expect(result.subject).toBeNull();
  });

  it("handles missing title gracefully", () => {
    const content = `---\nsubject: pkg/a\n---\n正文内容。`;
    const result = parseSemanticMdFrontmatterPublic(content);
    expect(result.subject).toBe("pkg/a");
    expect(result.title).toBeUndefined();
  });
});

describe("collectFragmentsFromString (semantic-md)", () => {
  it("collects fragment from semantic md", () => {
    const content = `---
subject: pkg/auth
title: 认证模块
---

认证模块提供 JWT 令牌验证与刷新能力。
`;
    const frags = collectFragmentsFromString(
      content,
      "pkg/auth.semantic.md",
      "semantic-md",
    );
    expect(frags).toHaveLength(1);
    expect(frags[0].subjectId).toBe("pkg/auth");
    expect(frags[0].title).toBe("认证模块");
    expect(frags[0].sourceType).toBe("semantic-md");
    expect(frags[0].body).toContain("JWT");
  });

  it("returns empty array when subject is missing", () => {
    const content = `---\ntitle: No Subject\n---\n正文。`;
    const frags = collectFragmentsFromString(
      content,
      "x.semantic.md",
      "semantic-md",
    );
    expect(frags).toHaveLength(0);
  });
});

describe("buildSemanticCatalog", () => {
  it("indexes fragments by subjectId", () => {
    const frags = [
      {
        subjectId: "a",
        body: "文本A",
        sourcePath: "f.md",
        startLine: 1,
        sourceType: "readme-anchor" as const,
        referencedStableKeys: [],
      },
      {
        subjectId: "b",
        body: "文本B",
        sourcePath: "g.md",
        startLine: 1,
        sourceType: "readme-anchor" as const,
        referencedStableKeys: [],
      },
      {
        subjectId: "a",
        body: "文本A2",
        sourcePath: "h.md",
        startLine: 1,
        sourceType: "semantic-md" as const,
        referencedStableKeys: [],
      },
    ];
    const { catalog } = buildSemanticCatalog(frags);
    expect(catalog.getFragments("a")).toHaveLength(2);
    expect(catalog.getFragments("b")).toHaveLength(1);
    expect(catalog.fragmentCount).toBe(3);
    expect(catalog.subjectIds().sort()).toEqual(["a", "b"]);
  });

  it("returns empty for unknown subjectId", () => {
    const { catalog } = buildSemanticCatalog([]);
    expect(catalog.getFragments("missing")).toEqual([]);
  });

  it("emits error finding for unresolved subject binding when registry provided", () => {
    const frag = {
      subjectId: "nonexistent/subject",
      body: "中文语义内容",
      sourcePath: "README.md",
      startLine: 5,
      sourceType: "readme-anchor" as const,
      referencedStableKeys: [],
    };
    // Simulate a minimal registry with known subjects
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const fakeRegistry = {
      subjects: [{ id: "real/subject" }],
    } as SubjectRegistry;
    const { findings } = buildSemanticCatalog([frag], fakeRegistry, null);
    const errorFindings = findings.filter(
      (f) => f.code === "UNRESOLVED_SUBJECT_BINDING",
    );
    expect(errorFindings).toHaveLength(1);
    expect(errorFindings[0].severity).toBe("error");
  });

  it("does not emit a primary-language warning by default", () => {
    const frag = {
      subjectId: "pkg/x",
      body: "This module provides authentication utilities for the CAT system.",
      sourcePath: "README.md",
      startLine: 1,
      sourceType: "readme-anchor" as const,
      referencedStableKeys: [],
    };

    const { findings } = buildSemanticCatalog([frag]);
    expect(
      findings.find((f) => f.code === "FRAGMENT_ENGLISH_DOMINANT"),
    ).toBeUndefined();
  });

  it("emits a primary-language warning when explicitly enabled", () => {
    const frag = {
      subjectId: "pkg/x",
      body: "This module provides authentication utilities for the CAT system.",
      sourcePath: "README.md",
      startLine: 1,
      sourceType: "readme-anchor" as const,
      referencedStableKeys: [],
    };

    const { findings } = buildSemanticCatalog([frag], null, null, {
      validatePrimaryLanguage: true,
    });

    expect(findings.some((f) => f.code === "FRAGMENT_ENGLISH_DOMINANT")).toBe(
      true,
    );
  });

  it("emits warning for duplicate fragments from same source file", () => {
    const frags = [
      {
        subjectId: "pkg/a",
        body: "中文A",
        sourcePath: "README.md",
        startLine: 1,
        sourceType: "readme-anchor" as const,
        referencedStableKeys: [],
      },
      {
        subjectId: "pkg/a",
        body: "中文B",
        sourcePath: "README.md",
        startLine: 10,
        sourceType: "readme-anchor" as const,
        referencedStableKeys: [],
      },
    ];
    const { findings } = buildSemanticCatalog(frags);
    const dupFindings = findings.filter((f) => f.code === "DUPLICATE_FRAGMENT");
    expect(dupFindings).toHaveLength(1);
  });

  it("no findings for well-formed Chinese fragments", () => {
    const frag = {
      subjectId: "pkg/x",
      body: "这个包实现了工作流核心逻辑，包括任务调度、状态机与事件总线。",
      sourcePath: "README.md",
      startLine: 1,
      sourceType: "readme-anchor" as const,
      referencedStableKeys: [],
    };
    const { findings } = buildSemanticCatalog([frag]);
    expect(findings).toHaveLength(0);
  });
});
