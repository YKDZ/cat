import { describe, it, expect } from "vitest";

import type { SectionIR, SubjectIR } from "../subjects/ir.js";

import { SubjectRegistry, buildMembershipIndex } from "../subjects/registry.js";
import { validateStructural } from "./structural.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeSectionIR = (id: string, order = 1): SectionIR => ({
  id,
  title: { zh: `${id} 中文`, en: `${id} English` },
  order,
  public: true,
});

const makeSubjectIR = (
  partial: Partial<SubjectIR> & { id: string; primaryOwner: string },
  section: SectionIR,
): SubjectIR => ({
  id: partial.id,
  title: { zh: "测试", en: "Test" },
  section,
  primaryOwner: partial.primaryOwner,
  secondaryAssociations: partial.secondaryAssociations ?? [],
  members: partial.members ?? [],
  semanticFragments: partial.semanticFragments ?? [],
  dependsOn: partial.dependsOn ?? [],
  public: partial.public ?? true,
  manifestPath: partial.manifestPath ?? `autodoc.subjects/packages/${partial.id}.subject.ts`,
});

// ── SubjectRegistry ───────────────────────────────────────────────────────────

describe("SubjectRegistry", () => {
  const section = makeSectionIR("domain");
  const subjects = [
    makeSubjectIR({ id: "domain", primaryOwner: "@cat/domain" }, section),
    makeSubjectIR({ id: "operations", primaryOwner: "@cat/operations" }, section),
  ];

  const registry = new SubjectRegistry(subjects, [section]);

  it("finds a subject by ID", () => {
    expect(registry.findSubject("domain")?.id).toBe("domain");
    expect(registry.findSubject("notexist")).toBeUndefined();
  });

  it("checks subject existence", () => {
    expect(registry.hasSubject("domain")).toBe(true);
    expect(registry.hasSubject("unknown")).toBe(false);
  });

  it("returns subjects by section", () => {
    const inDomain = registry.subjectsBySection("domain");
    expect(inDomain).toHaveLength(2);
  });

  it("returns sections sorted by order", () => {
    const s1 = makeSectionIR("infra", 2);
    const s2 = makeSectionIR("ai", 4);
    const reg2 = new SubjectRegistry([], [s2, s1]);
    expect(reg2.sections[0]?.id).toBe("infra");
    expect(reg2.sections[1]?.id).toBe("ai");
  });
});

// ── buildMembershipIndex ──────────────────────────────────────────────────────

describe("buildMembershipIndex", () => {
  const section = makeSectionIR("domain");
  const subjects = [
    makeSubjectIR(
      {
        id: "domain",
        primaryOwner: "@cat/domain",
        secondaryAssociations: ["@cat/operations"],
      },
      section,
    ),
    makeSubjectIR({ id: "ops", primaryOwner: "@cat/ops" }, section),
  ];
  const registry = new SubjectRegistry(subjects, [section]);

  it("builds primary and secondary membership entries", () => {
    const memberships = buildMembershipIndex(registry);
    expect(memberships.find((m) => m.packageName === "@cat/domain")?.role).toBe("primary");
    expect(memberships.find((m) => m.packageName === "@cat/operations")?.role).toBe("secondary");
    expect(memberships.find((m) => m.packageName === "@cat/ops")?.role).toBe("primary");
  });
});

// ── validateStructural ────────────────────────────────────────────────────────

describe("validateStructural", () => {
  const section = makeSectionIR("domain");
  const knownPackages = new Set(["@cat/domain", "@cat/operations"]);

  it("returns no findings for a clean registry", () => {
    const subject = makeSubjectIR(
      {
        id: "domain",
        primaryOwner: "@cat/domain",
        secondaryAssociations: ["@cat/operations"],
        members: [{ type: "package", ref: "@cat/domain" }],
      },
      section,
    );
    const registry = new SubjectRegistry([subject], [section]);
    const findings = validateStructural(registry, knownPackages);
    expect(findings).toHaveLength(0);
  });

  it("warns when primaryOwner is not in configured packages", () => {
    const subject = makeSubjectIR(
      { id: "x", primaryOwner: "@cat/unknown" },
      section,
    );
    const registry = new SubjectRegistry([subject], [section]);
    const findings = validateStructural(registry, knownPackages);
    expect(findings.some((f) => f.code === "UNKNOWN_PRIMARY_OWNER")).toBe(true);
  });

  it("warns when secondary association is not in configured packages", () => {
    const subject = makeSubjectIR(
      {
        id: "x",
        primaryOwner: "@cat/domain",
        secondaryAssociations: ["@cat/ghost"],
      },
      section,
    );
    const registry = new SubjectRegistry([subject], [section]);
    const findings = validateStructural(registry, knownPackages);
    expect(findings.some((f) => f.code === "UNKNOWN_SECONDARY_ASSOCIATION")).toBe(true);
  });

  it("warns when secondary association duplicates primary owner", () => {
    const subject = makeSubjectIR(
      {
        id: "x",
        primaryOwner: "@cat/domain",
        secondaryAssociations: ["@cat/domain"],
      },
      section,
    );
    const registry = new SubjectRegistry([subject], [section]);
    const findings = validateStructural(registry, knownPackages);
    expect(findings.some((f) => f.code === "SECONDARY_DUPLICATES_PRIMARY")).toBe(true);
  });

  it("errors when dependsOn references missing subject", () => {
    const subject = makeSubjectIR(
      {
        id: "x",
        primaryOwner: "@cat/domain",
        dependsOn: ["nonexistent"],
      },
      section,
    );
    const registry = new SubjectRegistry([subject], [section]);
    const findings = validateStructural(registry, knownPackages);
    expect(
      findings.some(
        (f) => f.code === "DEPENDENCY_NOT_FOUND" && f.severity === "error",
      ),
    ).toBe(true);
  });

  it("returns no dependency errors when dependsOn references an existing subject", () => {
    const subjectA = makeSubjectIR(
      { id: "a", primaryOwner: "@cat/domain" },
      section,
    );
    const subjectB = makeSubjectIR(
      { id: "b", primaryOwner: "@cat/operations", dependsOn: ["a"] },
      section,
    );
    const registry = new SubjectRegistry([subjectA, subjectB], [section]);
    const findings = validateStructural(registry, knownPackages);
    expect(findings.filter((f) => f.code === "DEPENDENCY_NOT_FOUND")).toHaveLength(0);
  });

  it("produces no findings when known packages set is empty (skip package validation)", () => {
    const subject = makeSubjectIR(
      { id: "x", primaryOwner: "@some/unknown" },
      section,
    );
    const registry = new SubjectRegistry([subject], [section]);
    const findings = validateStructural(registry, new Set());
    // Empty known packages → no UNKNOWN_PRIMARY_OWNER warnings
    expect(findings.filter((f) => f.code === "UNKNOWN_PRIMARY_OWNER")).toHaveLength(0);
  });
});
