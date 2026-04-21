import { describe, it, expect } from "vitest";

import type { SectionIR, SubjectIR } from "../subjects/ir.js";
import type { SemanticCatalog } from "../semantic/ir.js";
import type { ReferenceCatalog } from "../reference/compiler.js";

import { buildAgentCatalog } from "./agent-catalog.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeSection = (id = "domain"): SectionIR => ({
  id,
  title: { zh: "领域模型", en: "Domain Model" },
  order: 1,
  public: true,
});

const makeSubject = (
  id: string,
  opts: Partial<SubjectIR> = {},
): SubjectIR => {
  const section = opts.section ?? makeSection();
  return {
    id,
    title: { zh: `${id} ZH`, en: `${id} EN` },
    section,
    primaryOwner: `@cat/${id.split("/")[1] ?? id}`,
    secondaryAssociations: [],
    members: [],
    semanticFragments: [],
    dependsOn: [],
    public: true,
    manifestPath: `autodoc.subjects/packages/${id}.subject.ts`,
    ...opts,
  };
};

const makeSemanticCatalog = (
  fragmentsBySubject: Record<string, number> = {},
): SemanticCatalog => ({
  getFragments: (id: string) =>
    Array.from({ length: fragmentsBySubject[id] ?? 0 }, (_, i) => ({
      subjectId: id,
      body: `fragment ${i}`,
      sourcePath: "README.md",
      startLine: i + 1,
      sourceType: "readme-anchor" as const,
      referencedStableKeys: [],
    })),
  subjectIds: () => Object.keys(fragmentsBySubject),
  fragmentCount: Object.values(fragmentsBySubject).reduce((n, c) => n + c, 0),
});

const makeReferenceCatalog = (): ReferenceCatalog => ({
  packages: [],
  resolveById: () => undefined,
  resolveByStableKey: () => undefined,
  resolveByName: () => [],
  toSymbolIndex: () => [],
  symbolCount: 0,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("buildAgentCatalog", () => {
  describe("subjects.json", () => {
    it("serializes valid JSON", () => {
      const subjects = [makeSubject("domain/core")];
      const { subjectsJson } = buildAgentCatalog(
        subjects,
        [makeSection()],
        makeSemanticCatalog(),
        makeReferenceCatalog(),
      );
      expect(() => JSON.parse(subjectsJson)).not.toThrow();
    });

    it("includes all public subjects", () => {
      const subjects = [
        makeSubject("domain/core"),
        makeSubject("domain/ops"),
      ];
      const { subjectsJson } = buildAgentCatalog(
        subjects,
        [makeSection()],
        makeSemanticCatalog(),
        makeReferenceCatalog(),
      );
      const parsed = JSON.parse(subjectsJson) as { id: string }[];
      const ids = parsed.map((e) => e.id);
      expect(ids).toContain("domain/core");
      expect(ids).toContain("domain/ops");
    });

    it("excludes non-public subjects", () => {
      const subjects = [
        makeSubject("domain/public"),
        makeSubject("domain/private", { public: false }),
      ];
      const { subjectsJson } = buildAgentCatalog(
        subjects,
        [makeSection()],
        makeSemanticCatalog(),
        makeReferenceCatalog(),
      );
      const parsed = JSON.parse(subjectsJson) as { id: string }[];
      const ids = parsed.map((e) => e.id);
      expect(ids).toContain("domain/public");
      expect(ids).not.toContain("domain/private");
    });

    it("sorts subjects by id for deterministic output", () => {
      const subjects = [makeSubject("domain/z"), makeSubject("domain/a")];
      const { subjectsJson } = buildAgentCatalog(
        subjects,
        [makeSection()],
        makeSemanticCatalog(),
        makeReferenceCatalog(),
      );
      const parsed = JSON.parse(subjectsJson) as { id: string }[];
      expect(parsed[0].id).toBe("domain/a");
      expect(parsed[1].id).toBe("domain/z");
    });

    it("includes correct zhPage and enPage paths", () => {
      const subject = makeSubject("domain/core");
      const { subjectsJson } = buildAgentCatalog(
        [subject],
        [makeSection()],
        makeSemanticCatalog(),
        makeReferenceCatalog(),
      );
      const parsed = JSON.parse(subjectsJson) as { zhPage: string; enPage: string }[];
      expect(parsed[0].zhPage).toBe("domain/domain--core.zh.md");
      expect(parsed[0].enPage).toBe("domain/domain--core.en.md");
    });

    it("includes fragmentCount from semantic catalog", () => {
      const subject = makeSubject("domain/core");
      const { subjectsJson } = buildAgentCatalog(
        [subject],
        [makeSection()],
        makeSemanticCatalog({ "domain/core": 3 }),
        makeReferenceCatalog(),
      );
      const parsed = JSON.parse(subjectsJson) as { fragmentCount: number }[];
      expect(parsed[0].fragmentCount).toBe(3);
    });
  });

  describe("references.json", () => {
    it("serializes valid JSON", () => {
      const { referencesJson } = buildAgentCatalog(
        [],
        [],
        makeSemanticCatalog(),
        makeReferenceCatalog(),
      );
      expect(() => JSON.parse(referencesJson)).not.toThrow();
    });

    it("includes symbols from packages", () => {
      const catalog: ReferenceCatalog = {
        ...makeReferenceCatalog(),
        packages: [{
          name: "@cat/domain",
          path: "/packages/domain",
          priority: "high",
          modules: [{
            filePath: "src/index.ts",
            symbols: [{
              id: "@cat/domain:src/index:MyType",
              name: "MyType",
              kind: "interface",
              signature: "interface MyType {}",
              sourceLocation: { filePath: "src/index.ts", line: 1, endLine: 5 },
              parameters: [],
            }],
          }],
        }],
      };
      const { referencesJson } = buildAgentCatalog([], [], makeSemanticCatalog(), catalog);
      const parsed = JSON.parse(referencesJson) as { id: string; name: string }[];

      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe("@cat/domain:src/index:MyType");
      expect(parsed[0].name).toBe("MyType");
    });

    it("sorts entries by stableKey for deterministic output", () => {
      const catalog: ReferenceCatalog = {
        ...makeReferenceCatalog(),
        packages: [{
          name: "@cat/domain",
          path: "/packages/domain",
          priority: "high",
          modules: [{
            filePath: "src/index.ts",
            symbols: [
              {
                id: "@cat/domain:src/index:ZType",
                name: "ZType",
                kind: "type",
                signature: "type ZType = string",
                stableKey: "@cat/domain:src/index:ZType",
                sourceLocation: { filePath: "src/index.ts", line: 10, endLine: 10 },
                parameters: [],
              },
              {
                id: "@cat/domain:src/index:AType",
                name: "AType",
                kind: "type",
                signature: "type AType = number",
                stableKey: "@cat/domain:src/index:AType",
                sourceLocation: { filePath: "src/index.ts", line: 1, endLine: 1 },
                parameters: [],
              },
            ],
          }],
        }],
      };
      const { referencesJson } = buildAgentCatalog([], [], makeSemanticCatalog(), catalog);
      const parsed = JSON.parse(referencesJson) as { stableKey: string }[];

      expect(parsed[0].stableKey).toBe("@cat/domain:src/index:AType");
      expect(parsed[1].stableKey).toBe("@cat/domain:src/index:ZType");
    });
  });
});
