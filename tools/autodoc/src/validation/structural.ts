import type { ValidationFinding } from "./findings.js";
import type { SubjectRegistry } from "../subjects/registry.js";
import type { SubjectIR } from "../subjects/ir.js";

/**
 * @zh Tier-1 结构校验：对 manifest 语法以外的跨 subject 约束进行校验。
 * manifest 解析错误已在 loadRegistry 中收集；此处只执行 registry 层面的结构约束。
 *
 * @en Tier-1 structural validation: cross-subject constraints beyond manifest syntax.
 * Manifest parse errors are collected in loadRegistry; this validates registry-level structure.
 */
export const validateStructural = (
  registry: SubjectRegistry,
  knownPackageNames: Set<string>,
): ValidationFinding[] => {
  const findings: ValidationFinding[] = [];

  for (const subject of registry.subjects) {
    findings.push(...validateSubjectConstraints(subject, registry, knownPackageNames));
  }

  return findings;
};

const validateSubjectConstraints = (
  subject: SubjectIR,
  registry: SubjectRegistry,
  knownPackageNames: Set<string>,
): ValidationFinding[] => {
  const findings: ValidationFinding[] = [];
  const loc = { file: subject.manifestPath };

  // Primary owner must be a known package if any packages are configured
  if (knownPackageNames.size > 0 && !knownPackageNames.has(subject.primaryOwner)) {
    findings.push({
      severity: "warning",
      tier: 1,
      code: "UNKNOWN_PRIMARY_OWNER",
      message: `Subject "${subject.id}" has primaryOwner "${subject.primaryOwner}" which is not in the configured packages list`,
      location: loc,
    });
  }

  // Secondary associations must be known packages
  for (const pkg of subject.secondaryAssociations) {
    if (knownPackageNames.size > 0 && !knownPackageNames.has(pkg)) {
      findings.push({
        severity: "warning",
        tier: 1,
        code: "UNKNOWN_SECONDARY_ASSOCIATION",
        message: `Subject "${subject.id}" has secondary association with unknown package "${pkg}"`,
        location: loc,
      });
    }

    // Secondary association should not duplicate primary owner
    if (pkg === subject.primaryOwner) {
      findings.push({
        severity: "warning",
        tier: 1,
        code: "SECONDARY_DUPLICATES_PRIMARY",
        message: `Subject "${subject.id}" lists primaryOwner "${pkg}" also in secondaryAssociations`,
        location: loc,
      });
    }
  }

  // Dependency subjects must exist in registry
  for (const depId of subject.dependsOn) {
    if (!registry.hasSubject(depId)) {
      findings.push({
        severity: "error",
        tier: 1,
        code: "DEPENDENCY_NOT_FOUND",
        message: `Subject "${subject.id}" depends on unknown subject "${depId}"`,
        location: loc,
      });
    }
  }

  // Publication member type must be in allowed set
  for (const member of subject.members) {
    if (!["package", "subsystem", "zodSchema"].includes(member.type)) {
      findings.push({
        severity: "error",
        tier: 1,
        code: "INVALID_MEMBER_TYPE",
        message: `Subject "${subject.id}" has member with invalid type "${member.type}"`,
        location: loc,
      });
    }

    // Package-type members should reference known packages
    if (member.type === "package" && knownPackageNames.size > 0 && !knownPackageNames.has(member.ref)) {
      findings.push({
        severity: "warning",
        tier: 1,
        code: "UNKNOWN_PACKAGE_MEMBER",
        message: `Subject "${subject.id}" has package member "${member.ref}" which is not in the configured packages list`,
        location: loc,
      });
    }
  }

  return findings;
};
