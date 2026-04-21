import { describe, it, expect } from "vitest";

import type { SectionIR, SubjectIR } from "../subjects/ir.js";

import { buildSectionIndex, buildAllSectionIndexes } from "./subject-index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeSection = (id: string, order = 1): SectionIR => ({
  id,
  title: { zh: `${id} 中文`, en: `${id} English` },
  order,
  public: true,
});

const makeSubject = (
  id: string,
  section: SectionIR,
  opts: { public?: boolean; title?: { zh: string; en: string } } = {},
): SubjectIR => ({
  id,
  title: opts.title ?? { zh: `${id} ZH`, en: `${id} EN` },
  section,
  primaryOwner: `@cat/${id.split("/")[1] ?? id}`,
  secondaryAssociations: [],
  members: [],
  semanticFragments: [],
  dependsOn: [],
  public: opts.public ?? true,
  manifestPath: `autodoc.subjects/packages/${id}.subject.ts`,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("buildSectionIndex", () => {
  it("renders heading with bilingual section title", () => {
    const section = makeSection("domain");
    const content = buildSectionIndex(section, []);

    expect(content).toContain("# domain 中文 / domain English");
    expect(content).toContain("`domain`");
  });

  it("shows placeholder when no subjects", () => {
    const section = makeSection("domain");
    const content = buildSectionIndex(section, []);

    expect(content).toContain("暂无发布主题");
  });

  it("lists subjects in a markdown table", () => {
    const section = makeSection("domain");
    const subject = makeSubject("domain/core", section, {
      title: { zh: "领域核心", en: "Domain Core" },
    });
    const content = buildSectionIndex(section, [subject]);

    expect(content).toContain("## 主题列表 / Topics");
    expect(content).toContain("领域核心");
    expect(content).toContain("Domain Core");
    expect(content).toContain("`domain/core`");
  });

  it("links to correct ZH/EN page slugs", () => {
    const section = makeSection("domain");
    const subject = makeSubject("domain/core", section);
    const content = buildSectionIndex(section, [subject]);

    expect(content).toContain("./domain--core.zh.md");
    expect(content).toContain("./domain--core.en.md");
  });

  it("only lists subjects belonging to this section", () => {
    const domain = makeSection("domain");
    const services = makeSection("services");
    const domainSubject = makeSubject("domain/core", domain);
    const servicesSubject = makeSubject("services/workflow", services);

    const content = buildSectionIndex(domain, [domainSubject, servicesSubject]);

    expect(content).toContain("domain/core");
    expect(content).not.toContain("services/workflow");
  });

  it("excludes non-public subjects", () => {
    const section = makeSection("domain");
    const publicSubject = makeSubject("domain/public", section);
    const privateSubject = makeSubject("domain/private", section, { public: false });

    const content = buildSectionIndex(section, [publicSubject, privateSubject]);

    expect(content).toContain("domain/public");
    expect(content).not.toContain("domain/private");
  });

  it("sorts subjects alphabetically by ZH title", () => {
    const section = makeSection("domain");
    const b = makeSubject("domain/b", section, { title: { zh: "Beta", en: "Beta" } });
    const a = makeSubject("domain/a", section, { title: { zh: "Alpha", en: "Alpha" } });

    const content = buildSectionIndex(section, [b, a]);
    const alphaPos = content.indexOf("Alpha");
    const betaPos = content.indexOf("Beta");

    expect(alphaPos).toBeLessThan(betaPos);
  });
});

describe("buildAllSectionIndexes", () => {
  it("produces an index for each public section", () => {
    const domain = makeSection("domain");
    const services = makeSection("services");
    const indexes = buildAllSectionIndexes([domain, services], []);

    expect(indexes.size).toBe(2);
    expect(indexes.has("domain")).toBe(true);
    expect(indexes.has("services")).toBe(true);
  });

  it("skips non-public sections", () => {
    const publicSection: SectionIR = { ...makeSection("domain"), public: true };
    const privateSection: SectionIR = { ...makeSection("internal"), public: false };

    const indexes = buildAllSectionIndexes([publicSection, privateSection], []);

    expect(indexes.has("domain")).toBe(true);
    expect(indexes.has("internal")).toBe(false);
  });

  it("returns empty map for empty sections array", () => {
    const indexes = buildAllSectionIndexes([], []);
    expect(indexes.size).toBe(0);
  });
});
