import type { SemanticCatalog } from "../semantic/ir.js";
import type { SectionIR } from "../subjects/ir.js";
import type { SubjectRegistry } from "../subjects/registry.js";
import type { ValidationFinding } from "./findings.js";

/**
 * @zh Tier-3：发布完整性校验 — 校验成对页面与 section index 是否完整。
 * @en Tier-3: Publication integrity validation — checks that paired pages and section indexes are complete.
 */
export const validatePublication = (
  registry: SubjectRegistry,
  sections: SectionIR[],
  semanticCatalog: SemanticCatalog,
  existingOutputPaths: Set<string>,
): ValidationFinding[] => {
  const findings: ValidationFinding[] = [];
  const publicSections = sections.filter((s) => s.public);
  const sectionIds = new Set(publicSections.map((s) => s.id));

  // Check each public subject has paired pages
  for (const subject of registry.subjects.filter((s) => s.public)) {
    if (!sectionIds.has(subject.section.id)) {
      // Already caught in Tier-1, skip
      continue;
    }

    const slug = subject.id.replace(/\//g, "--");
    const zhPath = `${subject.section.id}/${slug}.zh.md`;
    const enPath = `${subject.section.id}/${slug}.en.md`;

    if (!existingOutputPaths.has(zhPath)) {
      findings.push({
        severity: "error",
        tier: 3,
        code: "MISSING_ZH_PAGE",
        message: `Subject "${subject.id}" is missing its ZH page at "${zhPath}"`,
        location: { file: subject.manifestPath },
      });
    }

    if (!existingOutputPaths.has(enPath)) {
      findings.push({
        severity: "error",
        tier: 3,
        code: "MISSING_EN_PAGE",
        message: `Subject "${subject.id}" is missing its EN page at "${enPath}"`,
        location: { file: subject.manifestPath },
      });
    }

    // Warn if subject has no semantic fragments at all
    const frags = semanticCatalog.getFragments(subject.id);
    if (frags.length === 0) {
      findings.push({
        severity: "warning",
        tier: 3,
        code: "SUBJECT_NO_FRAGMENTS",
        message: `Subject "${subject.id}" has no semantic fragments; ZH page will be empty`,
        location: { file: subject.manifestPath },
      });
    }
  }

  // Check each public section has an index.md
  for (const section of publicSections) {
    const indexPath = `${section.id}/index.md`;
    if (!existingOutputPaths.has(indexPath)) {
      findings.push({
        severity: "error",
        tier: 3,
        code: "MISSING_SECTION_INDEX",
        message: `Section "${section.id}" is missing its index.md at "${indexPath}"`,
        location: undefined,
      });
    }
  }

  return findings;
};
