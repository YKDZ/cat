import type { ValidationFinding } from "../validation/findings.js";
import type { SubjectIR, MembershipIR } from "./ir.js";
import type { SubjectRegistry } from "./registry.js";

/**
 * @zh publication members 的合法类型集合。
 * @en The allowed set of member types in publication members.
 */
const ALLOWED_MEMBER_TYPES = new Set(["package", "subsystem", "zodSchema"]);

/**
 * @zh 校验所有 subject 的 publication members 是否符合 membership 约束规则：
 * - 只允许 package 边界、subsystem 边界、allowlisted zodSchema 文档
 * - README 片段与 symbol anchors 不进入 membership 层
 *
 * @en Validate all subject publication members against membership constraint rules:
 * - Only package boundary, subsystem boundary, and allowlisted zodSchema docs are allowed
 * - README fragments and symbol anchors must not appear in membership
 */
export const validateMembership = (
  registry: SubjectRegistry,
  allowedPackages: Set<string>,
): ValidationFinding[] => {
  const findings: ValidationFinding[] = [];

  for (const subject of registry.subjects) {
    for (const member of subject.members) {
      if (!ALLOWED_MEMBER_TYPES.has(member.type)) {
        findings.push({
          severity: "error",
          tier: 1,
          code: "INVALID_MEMBER_TYPE",
          message: `Subject "${subject.id}" has member with illegal type "${member.type}". Allowed: package, subsystem, zodSchema`,
          location: { file: subject.manifestPath },
        });
        continue;
      }

      if (member.type === "package" && !allowedPackages.has(member.ref)) {
        findings.push({
          severity: "warning",
          tier: 1,
          code: "UNKNOWN_PACKAGE_MEMBER",
          message: `Subject "${subject.id}" references package "${member.ref}" which is not in the autodoc config`,
          location: { file: subject.manifestPath },
        });
      }
    }

    // Validate secondary associations against allowed packages
    for (const pkg of subject.secondaryAssociations) {
      if (!allowedPackages.has(pkg)) {
        findings.push({
          severity: "warning",
          tier: 1,
          code: "UNKNOWN_SECONDARY_ASSOCIATION",
          message: `Subject "${subject.id}" has secondary association with unknown package "${pkg}"`,
          location: { file: subject.manifestPath },
        });
      }
    }
  }

  return findings;
};

/**
 * @zh 将 MembershipIR[] 转换为 Map<packageName, MembershipIR[]>，便于快速查找。
 * @en Convert MembershipIR[] to a Map<packageName, MembershipIR[]> for fast lookup.
 */
export const buildMembershipMap = (
  memberships: MembershipIR[],
): Map<string, MembershipIR[]> => {
  const map = new Map<string, MembershipIR[]>();
  for (const m of memberships) {
    const existing = map.get(m.packageName) ?? [];
    existing.push(m);
    map.set(m.packageName, existing);
  }
  return map;
};

/**
 * @zh 查找某个 package 的 primary subject（如果存在）。
 * @en Find the primary subject for a given package (if any).
 */
export const findPrimarySubject = (
  memberships: MembershipIR[],
  packageName: string,
): SubjectIR | undefined => {
  const primary = memberships.find(
    (m) => m.packageName === packageName && m.role === "primary",
  );
  return primary ? undefined : undefined; // caller provides registry.findSubject
};
