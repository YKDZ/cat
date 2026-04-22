import { describe, it, expect } from "vitest";

import type { SemanticCatalog } from "../semantic/ir.js";
import type { SectionIR, SubjectIR } from "../subjects/ir.js";

import { SubjectRegistry } from "../subjects/registry.js";
import { validatePublication } from "./publication.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeSection = (id = "domain", pub = true): SectionIR => ({
  id,
  title: { zh: `${id} ZH`, en: `${id} EN` },
  order: 1,
  public: pub,
});

const makeSubject = (
  id: string,
  section: SectionIR,
  opts: { public?: boolean } = {},
): SubjectIR => ({
  id,
  title: { zh: "Test ZH", en: "Test EN" },
  section,
  primaryOwner: "@cat/test",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/test" }],
  semanticFragments: [],
  dependsOn: [],
  public: opts.public ?? true,
  manifestPath: `packages/${id}/${id}.subject.ts`,
});

const makeSemanticCatalog = (subjects: string[] = []): SemanticCatalog => ({
  getFragments: (id: string) =>
    subjects.includes(id)
      ? [
          {
            subjectId: id,
            body: "fragment",
            sourcePath: "README.md",
            startLine: 1,
            sourceType: "readme-anchor",
            referencedStableKeys: [],
          },
        ]
      : [],
  subjectIds: () => subjects,
  fragmentCount: subjects.length,
});

const makeRegistry = (
  subjects: SubjectIR[],
  sections: SectionIR[],
): SubjectRegistry => new SubjectRegistry(subjects, sections);

const makeOutputPaths = (...paths: string[]): Set<string> => new Set(paths);

// Helper: build expected path set for a subject
const subjectPaths = (section: string, id: string) => {
  const slug = id.replace(/\//g, "--");
  return [`${section}/${slug}.zh.md`, `${section}/${slug}.en.md`];
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("validatePublication (Tier-3)", () => {
  const section = makeSection("domain");

  it("returns no findings when all pages and index exist and fragments are present", () => {
    const subject = makeSubject("domain/core", section);
    const registry = makeRegistry([subject], [section]);
    const catalog = makeSemanticCatalog(["domain/core"]);
    const paths = makeOutputPaths(
      ...subjectPaths("domain", "domain/core"),
      "domain/index.md",
    );

    const findings = validatePublication(registry, [section], catalog, paths);
    expect(findings).toHaveLength(0);
  });

  it("emits MISSING_ZH_PAGE when ZH paired page is absent", () => {
    const subject = makeSubject("domain/core", section);
    const registry = makeRegistry([subject], [section]);
    const catalog = makeSemanticCatalog(["domain/core"]);
    // Only EN page and index, no ZH page
    const paths = makeOutputPaths(
      "domain/domain--core.en.md",
      "domain/index.md",
    );

    const findings = validatePublication(registry, [section], catalog, paths);
    const finding = findings.find((f) => f.code === "MISSING_ZH_PAGE");

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("error");
    expect(finding?.tier).toBe(3);
    expect(finding?.message).toContain("domain/core");
    expect(finding?.message).toContain("domain--core.zh.md");
  });

  it("emits MISSING_EN_PAGE when EN paired page is absent", () => {
    const subject = makeSubject("domain/core", section);
    const registry = makeRegistry([subject], [section]);
    const catalog = makeSemanticCatalog(["domain/core"]);
    const paths = makeOutputPaths(
      "domain/domain--core.zh.md",
      "domain/index.md",
    );

    const findings = validatePublication(registry, [section], catalog, paths);
    const finding = findings.find((f) => f.code === "MISSING_EN_PAGE");

    expect(finding).toBeDefined();
    expect(finding?.message).toContain("domain--core.en.md");
  });

  it("emits MISSING_SECTION_INDEX when index.md is absent", () => {
    const subject = makeSubject("domain/core", section);
    const registry = makeRegistry([subject], [section]);
    const catalog = makeSemanticCatalog(["domain/core"]);
    const paths = makeOutputPaths(...subjectPaths("domain", "domain/core")); // no index

    const findings = validatePublication(registry, [section], catalog, paths);
    const finding = findings.find((f) => f.code === "MISSING_SECTION_INDEX");

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("error");
    expect(finding?.message).toContain("domain");
    expect(finding?.message).toContain("domain/index.md");
  });

  it("emits SUBJECT_NO_FRAGMENTS warning when subject has no semantic fragments", () => {
    const subject = makeSubject("domain/core", section);
    const registry = makeRegistry([subject], [section]);
    const catalog = makeSemanticCatalog([]); // no fragments for domain/core
    const paths = makeOutputPaths(
      ...subjectPaths("domain", "domain/core"),
      "domain/index.md",
    );

    const findings = validatePublication(registry, [section], catalog, paths);
    const finding = findings.find((f) => f.code === "SUBJECT_NO_FRAGMENTS");

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("warning");
    expect(finding?.message).toContain("domain/core");
  });

  it("skips non-public subjects", () => {
    const privateSubject = makeSubject("domain/private", section, {
      public: false,
    });
    const registry = makeRegistry([privateSubject], [section]);
    const catalog = makeSemanticCatalog([]);
    const paths = makeOutputPaths("domain/index.md"); // no pages for private subject

    const findings = validatePublication(registry, [section], catalog, paths);
    // Should only have SUBJECT_NO_FRAGMENTS if any, but not MISSING_ZH_PAGE/EN_PAGE
    const pageMissing = findings.filter(
      (f) => f.code === "MISSING_ZH_PAGE" || f.code === "MISSING_EN_PAGE",
    );
    expect(pageMissing).toHaveLength(0);
  });

  it("skips non-public sections for index check", () => {
    const privateSection = makeSection("internal", false);
    const subject = makeSubject("internal/thing", privateSection);
    const registry = makeRegistry([subject], [privateSection]);
    const catalog = makeSemanticCatalog([]);
    const paths = makeOutputPaths(); // nothing exists

    const findings = validatePublication(
      registry,
      [privateSection],
      catalog,
      paths,
    );
    // Non-public section should not trigger MISSING_SECTION_INDEX
    const indexMissing = findings.filter(
      (f) => f.code === "MISSING_SECTION_INDEX",
    );
    expect(indexMissing).toHaveLength(0);
  });

  it("emits both ZH and EN page errors for same subject", () => {
    const subject = makeSubject("domain/core", section);
    const registry = makeRegistry([subject], [section]);
    const catalog = makeSemanticCatalog(["domain/core"]);
    const paths = makeOutputPaths("domain/index.md"); // no pages

    const findings = validatePublication(registry, [section], catalog, paths);
    const codes = findings.map((f) => f.code);

    expect(codes).toContain("MISSING_ZH_PAGE");
    expect(codes).toContain("MISSING_EN_PAGE");
  });

  it("handles ID with slashes in slug correctly", () => {
    const subject = makeSubject("services/workflow", makeSection("services"));
    const registry = makeRegistry([subject], [makeSection("services")]);
    const catalog = makeSemanticCatalog(["services/workflow"]);
    const paths = makeOutputPaths(
      "services/services--workflow.zh.md",
      "services/services--workflow.en.md",
      "services/index.md",
    );

    const findings = validatePublication(
      registry,
      [makeSection("services")],
      catalog,
      paths,
    );
    expect(findings).toHaveLength(0);
  });
});
