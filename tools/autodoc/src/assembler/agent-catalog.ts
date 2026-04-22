import type { ReferenceCatalog } from "../reference/compiler.js";
import type { SemanticCatalog } from "../semantic/ir.js";
import type { SubjectIR, SectionIR } from "../subjects/ir.js";

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
  /** @zh subjects catalog 内容（已排序，JSON 字符串） @en Machine-readable subjects catalog (sorted JSON string) */
  subjectsJson: string;
  /** @zh references catalog 内容（已排序，JSON 字符串） @en Machine-readable references catalog (sorted JSON string) */
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
 * @zh 生成机器可读的 subjects catalog 与 references catalog JSON 字符串。
 * 输出键顺序与排序均稳定，可 schema 校验。输出路径由调用方通过 config.catalog 决定。
 *
 * @en Generate the JSON strings for the machine-readable subjects catalog and references catalog.
 * Key order and sort order are both stable for schema validation. Output paths are determined
 * by the caller via config.catalog.
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
