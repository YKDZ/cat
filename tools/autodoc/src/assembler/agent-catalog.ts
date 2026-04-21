import type { SubjectIR, SectionIR } from "../subjects/ir.js";
import type { ReferenceCatalog } from "../reference/compiler.js";
import type { SemanticCatalog } from "../semantic/ir.js";

// ── Agent subject entry ────────────────────────────────────────────────────────

export interface AgentSubjectEntry {
  id: string;
  title: { zh: string; en: string };
  section: string;
  primaryOwner: string;
  secondaryAssociations: string[];
  dependsOn: string[];
  public: boolean;
  fragmentCount: number;
  zhPage: string;
  enPage: string;
}

// ── Agent reference entry ─────────────────────────────────────────────────────

export interface AgentReferenceEntry {
  id: string;
  stableKey: string;
  name: string;
  kind: string;
  packageName: string;
  filePath: string;
  line: number;
  description?: string;
}

// ── Agent catalog ─────────────────────────────────────────────────────────────

export interface AgentCatalogOutput {
  /** @zh agent/subjects.json 内容（已排序） @en Content for agent/subjects.json (sorted) */
  subjectsJson: string;
  /** @zh agent/references.json 内容（已排序） @en Content for agent/references.json (sorted) */
  referencesJson: string;
}

// ── Builders ───────────────────────────────────────────────────────────────────

const buildSubjectEntries = (
  subjects: SubjectIR[],
  semanticCatalog: SemanticCatalog,
): AgentSubjectEntry[] =>
  subjects
    .filter((s) => s.public)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => ({
      id: s.id,
      title: s.title,
      section: s.section.id,
      primaryOwner: s.primaryOwner,
      secondaryAssociations: [...s.secondaryAssociations].sort(),
      dependsOn: [...s.dependsOn].sort(),
      public: s.public,
      fragmentCount: semanticCatalog.getFragments(s.id).length,
      zhPage: `${s.section.id}/${s.id.replace(/\//g, "--")}.zh.md`,
      enPage: `${s.section.id}/${s.id.replace(/\//g, "--")}.en.md`,
    }));

const buildReferenceEntries = (
  referenceCatalog: ReferenceCatalog,
): AgentReferenceEntry[] => {
  const entries: AgentReferenceEntry[] = [];
  for (const pkg of referenceCatalog.packages) {
    for (const mod of pkg.modules) {
      for (const sym of mod.symbols) {
        entries.push({
          id: sym.id,
          stableKey: sym.stableKey ?? sym.id,
          name: sym.name,
          kind: sym.kind,
          packageName: pkg.name,
          filePath: sym.sourceLocation.filePath,
          line: sym.sourceLocation.line,
          description: sym.description,
        });
      }
    }
  }
  // Stable sort by stableKey for deterministic output
  return entries.sort((a, b) => a.stableKey.localeCompare(b.stableKey));
};

/**
 * @zh 生成 agent/subjects.json 与 agent/references.json 的 JSON 字符串。
 * 输出键顺序与排序均稳定，可 schema 校验。
 *
 * @en Generate the JSON strings for agent/subjects.json and agent/references.json.
 * Key order and sort order are both stable for schema validation.
 */
export const buildAgentCatalog = (
  subjects: SubjectIR[],
  _sections: SectionIR[],
  semanticCatalog: SemanticCatalog,
  referenceCatalog: ReferenceCatalog,
): AgentCatalogOutput => {
  const subjectEntries = buildSubjectEntries(subjects, semanticCatalog);
  const referenceEntries = buildReferenceEntries(referenceCatalog);

  return {
    subjectsJson: JSON.stringify(subjectEntries, null, 2),
    referencesJson: JSON.stringify(referenceEntries, null, 2),
  };
};
