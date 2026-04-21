import { describe, it, expect } from "vitest";

import { ReferenceCatalog } from "../reference/compiler.js";
import type { SectionIR, SubjectIR } from "../subjects/ir.js";

import { SubjectRegistry } from "../subjects/registry.js";
import { validateReferenceHealth } from "./reference-health.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeSection = (id = "domain"): SectionIR => ({
  id,
  title: { zh: "Test", en: "Test" },
  order: 1,
  public: true,
});

const makeSubject = (
  id: string,
  primaryOwner: string,
  opts: {
    secondaryAssociations?: string[];
    members?: SubjectIR["members"];
    section?: SectionIR;
  } = {},
): SubjectIR => ({
  id,
  title: { zh: "测试", en: "Test" },
  section: opts.section ?? makeSection(),
  primaryOwner,
  secondaryAssociations: opts.secondaryAssociations ?? [],
  members: opts.members ?? [{ type: "package", ref: primaryOwner }],
  semanticFragments: [],
  dependsOn: [],
  public: true,
  manifestPath: `autodoc.subjects/packages/${id}.subject.ts`,
});

const makeReferenceCatalog = (packageNames: string[]): ReferenceCatalog =>
  new ReferenceCatalog(
    packageNames.map((name) => ({
      name,
      path: `/pkg/${name}`,
      priority: "medium" as const,
      modules: [],
    })),
  );

const makeRegistry = (subjects: SubjectIR[]): SubjectRegistry =>
  new SubjectRegistry(subjects, [makeSection()]);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("validateReferenceHealth (Tier-2)", () => {
  it("returns no findings when all packages are in the catalog", () => {
    const subject = makeSubject("domain/core", "@cat/domain");
    const catalog = makeReferenceCatalog(["@cat/domain"]);
    const findings = validateReferenceHealth(makeRegistry([subject]), catalog);

    expect(findings).toHaveLength(0);
  });

  it("emits UNRESOLVED_PRIMARY_OWNER when primaryOwner is not in catalog", () => {
    const subject = makeSubject("domain/core", "@cat/missing");
    const catalog = makeReferenceCatalog([]);
    const findings = validateReferenceHealth(makeRegistry([subject]), catalog);

    expect(findings).toHaveLength(2); // primaryOwner + member ref
    const ownerFinding = findings.find(
      (f) => f.code === "UNRESOLVED_PRIMARY_OWNER",
    );
    expect(ownerFinding).toBeDefined();
    expect(ownerFinding?.severity).toBe("warning");
    expect(ownerFinding?.tier).toBe(2);
    expect(ownerFinding?.message).toContain("@cat/missing");
  });

  it("emits UNRESOLVED_SECONDARY_ASSOCIATION for unknown secondary package", () => {
    const subject = makeSubject("domain/core", "@cat/domain", {
      secondaryAssociations: ["@cat/unknown"],
    });
    const catalog = makeReferenceCatalog(["@cat/domain"]);
    const findings = validateReferenceHealth(makeRegistry([subject]), catalog);

    const finding = findings.find(
      (f) => f.code === "UNRESOLVED_SECONDARY_ASSOCIATION",
    );
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("@cat/unknown");
  });

  it("emits UNRESOLVED_MEMBER_PACKAGE for unknown member package ref", () => {
    const subject = makeSubject("domain/core", "@cat/domain", {
      members: [{ type: "package", ref: "@cat/ghost" }],
    });
    const catalog = makeReferenceCatalog(["@cat/domain"]);
    const findings = validateReferenceHealth(makeRegistry([subject]), catalog);

    const finding = findings.find(
      (f) => f.code === "UNRESOLVED_MEMBER_PACKAGE",
    );
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("@cat/ghost");
  });

  it("locates findings to the manifest file path", () => {
    const subject = makeSubject("domain/core", "@cat/missing");
    const catalog = makeReferenceCatalog([]);
    const findings = validateReferenceHealth(makeRegistry([subject]), catalog);

    for (const f of findings) {
      expect(f.location?.file).toBe(subject.manifestPath);
    }
  });

  it("returns no findings when registry has no subjects", () => {
    const catalog = makeReferenceCatalog(["@cat/domain"]);
    const findings = validateReferenceHealth(makeRegistry([]), catalog);
    expect(findings).toHaveLength(0);
  });

  it("handles multiple subjects with mixed validity", () => {
    const good = makeSubject("domain/ok", "@cat/domain");
    const bad = makeSubject("domain/bad", "@cat/missing");
    const catalog = makeReferenceCatalog(["@cat/domain"]);
    const findings = validateReferenceHealth(
      makeRegistry([good, bad]),
      catalog,
    );

    // Only the bad subject should produce findings
    for (const f of findings) {
      expect(f.message).toContain("domain/bad");
    }
  });
});
