import { describe, it, expect } from "vitest";

import type { SemanticCatalog, SemanticFragment } from "../semantic/ir.js";
import type { SectionIR, SubjectIR } from "../subjects/ir.js";

import { ReferenceCatalog } from "../reference/compiler.js";
import { buildPairedPage, buildAllPairedPages } from "./paired-pages.js";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const makeSection = (id = "domain"): SectionIR => ({
  id,
  title: { zh: "领域模型", en: "Domain Model" },
  order: 1,
  public: true,
});

const makeSubject = (
  partial: Partial<SubjectIR> & { id: string },
  section = makeSection(),
): SubjectIR => ({
  id: partial.id,
  title: partial.title ?? { zh: "测试主题", en: "Test Subject" },
  section,
  primaryOwner: partial.primaryOwner ?? "@cat/test",
  secondaryAssociations: partial.secondaryAssociations ?? [],
  members: partial.members ?? [{ type: "package", ref: "@cat/test" }],
  semanticFragments: partial.semanticFragments ?? [],
  dependsOn: partial.dependsOn ?? [],
  public: partial.public ?? true,
  manifestPath: `packages/${partial.id}/${partial.id}.subject.ts`,
});

const makeSemanticCatalog = (
  fragments: Record<string, SemanticFragment[]> = {},
): SemanticCatalog => ({
  getFragments: (id: string) => fragments[id] ?? [],
  subjectIds: () => Object.keys(fragments),
  fragmentCount: Object.values(fragments).reduce((n, f) => n + f.length, 0),
});

const makeReferenceCatalog = (
  packages: ReferenceCatalog["packages"] = [],
): ReferenceCatalog => new ReferenceCatalog(packages);

const makeFragment = (
  subjectId: string,
  body: string,
  title?: string,
): SemanticFragment => ({
  subjectId,
  body,
  sourcePath: "packages/test/README.md",
  startLine: 1,
  sourceType: "readme-anchor",
  referencedStableKeys: [],
  title,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("buildPairedPage", () => {
  describe("ZH page", () => {
    it("includes subject title and section info", () => {
      const subject = makeSubject({
        id: "domain/core",
        title: { zh: "领域核心", en: "Domain Core" },
      });
      const page = buildPairedPage(
        subject,
        makeSemanticCatalog(),
        makeReferenceCatalog(),
      );

      expect(page.zhContent).toContain("# 领域核心");
      expect(page.zhContent).toContain("领域模型");
      expect(page.zhContent).toContain("`domain/core`");
    });

    it("renders fragment body when fragments exist", () => {
      const subject = makeSubject({ id: "domain/core" });
      const catalog = makeSemanticCatalog({
        "domain/core": [makeFragment("domain/core", "这是核心领域描述。")],
      });
      const page = buildPairedPage(subject, catalog, makeReferenceCatalog());

      expect(page.zhContent).toContain("这是核心领域描述。");
    });

    it("renders fragment title when present", () => {
      const subject = makeSubject({ id: "domain/core" });
      const catalog = makeSemanticCatalog({
        "domain/core": [makeFragment("domain/core", "描述文本。", "设计动机")],
      });
      const page = buildPairedPage(subject, catalog, makeReferenceCatalog());

      expect(page.zhContent).toContain("## 设计动机");
      expect(page.zhContent).toContain("描述文本。");
    });

    it("shows placeholder when no fragments", () => {
      const subject = makeSubject({ id: "domain/empty" });
      const page = buildPairedPage(
        subject,
        makeSemanticCatalog(),
        makeReferenceCatalog(),
      );

      expect(page.zhContent).toContain("暂无语义描述");
    });

    it("renders related topics for subjects with dependsOn", () => {
      const subject = makeSubject({
        id: "domain/core",
        dependsOn: ["infrastructure/db"],
      });
      const page = buildPairedPage(
        subject,
        makeSemanticCatalog(),
        makeReferenceCatalog(),
      );

      expect(page.zhContent).toContain("相关主题");
      expect(page.zhContent).toContain("`infrastructure/db`");
    });

    it("omits related topics section when dependsOn is empty", () => {
      const subject = makeSubject({ id: "domain/core", dependsOn: [] });
      const page = buildPairedPage(
        subject,
        makeSemanticCatalog(),
        makeReferenceCatalog(),
      );

      expect(page.zhContent).not.toContain("相关主题");
    });
  });

  describe("EN page", () => {
    it("includes subject title and primary owner", () => {
      const subject = makeSubject({
        id: "domain/core",
        title: { zh: "领域核心", en: "Domain Core" },
        primaryOwner: "@cat/domain",
      });
      const page = buildPairedPage(
        subject,
        makeSemanticCatalog(),
        makeReferenceCatalog(),
      );

      expect(page.enContent).toContain("# Domain Core");
      expect(page.enContent).toContain("`@cat/domain`");
    });

    it("lists secondary associations", () => {
      const subject = makeSubject({
        id: "domain/core",
        secondaryAssociations: ["@cat/shared"],
      });
      const page = buildPairedPage(
        subject,
        makeSemanticCatalog(),
        makeReferenceCatalog(),
      );

      expect(page.enContent).toContain("Also covers");
      expect(page.enContent).toContain("`@cat/shared`");
    });

    it("omits secondary associations when none", () => {
      const subject = makeSubject({
        id: "domain/core",
        secondaryAssociations: [],
      });
      const page = buildPairedPage(
        subject,
        makeSemanticCatalog(),
        makeReferenceCatalog(),
      );

      expect(page.enContent).not.toContain("Also covers");
    });

    it("renders API reference table when symbols exist", () => {
      const pkg = {
        name: "@cat/test",
        path: "/pkg/test",
        priority: "medium" as const,
        modules: [
          {
            relativePath: "src/index.ts",
            symbols: [
              {
                id: "@cat/test:src/index:myFn",
                name: "myFn",
                kind: "function" as const,
                signature: "() => void",
                isAsync: false,
                isExported: true,
                sourceLocation: {
                  filePath: "src/index.ts",
                  line: 1,
                  endLine: 1,
                },
                parameters: [],
                description: "Does something",
              },
            ],
          },
        ],
      };
      const referenceCatalog = makeReferenceCatalog([pkg]);
      const subject = makeSubject({
        id: "domain/core",
        primaryOwner: "@cat/test",
      });

      const page = buildPairedPage(
        subject,
        makeSemanticCatalog(),
        referenceCatalog,
      );

      expect(page.enContent).toContain("## API Reference");
      expect(page.enContent).toContain("`myFn`");
      expect(page.enContent).toContain("function");
    });

    it("renders related topics when dependsOn is set", () => {
      const subject = makeSubject({
        id: "domain/core",
        dependsOn: ["infrastructure/db"],
      });
      const page = buildPairedPage(
        subject,
        makeSemanticCatalog(),
        makeReferenceCatalog(),
      );

      expect(page.enContent).toContain("Related Topics");
      expect(page.enContent).toContain("`infrastructure/db`");
    });
  });

  describe("basePath", () => {
    it("uses section/subject slug as basePath", () => {
      const subject = makeSubject({ id: "domain/core" });
      const page = buildPairedPage(
        subject,
        makeSemanticCatalog(),
        makeReferenceCatalog(),
      );

      expect(page.basePath).toBe("domain/domain--core");
    });

    it("replaces slashes with double-dash in ID slug", () => {
      const subject = makeSubject(
        { id: "services/workflow" },
        makeSection("services"),
      );
      const page = buildPairedPage(
        subject,
        makeSemanticCatalog(),
        makeReferenceCatalog(),
      );

      expect(page.basePath).toBe("services/services--workflow");
    });
  });
});

describe("buildAllPairedPages", () => {
  it("generates a page for each public subject", () => {
    const subjects = [
      makeSubject({ id: "domain/core" }),
      makeSubject({ id: "domain/operations" }),
    ];
    const pages = buildAllPairedPages(
      subjects,
      makeSemanticCatalog(),
      makeReferenceCatalog(),
    );

    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.basePath)).toContain("domain/domain--core");
    expect(pages.map((p) => p.basePath)).toContain("domain/domain--operations");
  });

  it("skips non-public subjects", () => {
    const subjects = [
      makeSubject({ id: "domain/public" }),
      makeSubject({ id: "domain/private", public: false }),
    ];
    const pages = buildAllPairedPages(
      subjects,
      makeSemanticCatalog(),
      makeReferenceCatalog(),
    );

    expect(pages).toHaveLength(1);
    expect(pages[0].basePath).toContain("domain--public");
  });

  it("returns empty array when no public subjects", () => {
    const pages = buildAllPairedPages(
      [],
      makeSemanticCatalog(),
      makeReferenceCatalog(),
    );
    expect(pages).toHaveLength(0);
  });
});
