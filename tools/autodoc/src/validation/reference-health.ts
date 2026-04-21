import type { ReferenceCatalog } from "../reference/compiler.js";
import type { SubjectRegistry } from "../subjects/registry.js";
import type { ValidationFinding } from "./findings.js";

/**
 * @zh Tier-2：引用健康校验 — 校验 subject members 与 stableKey 引用的有效性。
 * @en Tier-2: Reference health validation — checks subject member and stableKey reference validity.
 */
export const validateReferenceHealth = (
  registry: SubjectRegistry,
  referenceCatalog: ReferenceCatalog,
): ValidationFinding[] => {
  const findings: ValidationFinding[] = [];
  const knownPackages = new Set(referenceCatalog.packages.map((p) => p.name));

  for (const subject of registry.subjects) {
    // Validate primaryOwner resolves to a scanned package
    if (!knownPackages.has(subject.primaryOwner)) {
      findings.push({
        severity: "warning",
        tier: 2,
        code: "UNRESOLVED_PRIMARY_OWNER",
        message: `Subject "${subject.id}" primaryOwner "${subject.primaryOwner}" was not found in the scanned reference catalog`,
        location: { file: subject.manifestPath },
      });
    }

    // Validate secondary associations
    for (const assoc of subject.secondaryAssociations) {
      if (!knownPackages.has(assoc)) {
        findings.push({
          severity: "warning",
          tier: 2,
          code: "UNRESOLVED_SECONDARY_ASSOCIATION",
          message: `Subject "${subject.id}" secondary association "${assoc}" was not found in the scanned reference catalog`,
          location: { file: subject.manifestPath },
        });
      }
    }

    // Validate publication members
    for (const member of subject.members) {
      if (member.type === "package" && !knownPackages.has(member.ref)) {
        findings.push({
          severity: "warning",
          tier: 2,
          code: "UNRESOLVED_MEMBER_PACKAGE",
          message: `Subject "${subject.id}" publication member "${member.ref}" (type:package) was not found in the scanned reference catalog`,
          location: { file: subject.manifestPath },
        });
      }
    }
  }

  return findings;
};
