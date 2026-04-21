import { glob } from "glob";
import { pathToFileURL } from "node:url";

import type { SubjectManifestConfig } from "../types.js";
import type { ValidationFinding } from "../validation/findings.js";
import type { SubjectIR, SectionIR, MembershipIR } from "./ir.js";

import { SubjectManifestConfigSchema } from "../types.js";
import { buildSubjectIR } from "./ir.js";

export interface RegistryLoadResult {
  registry: SubjectRegistry;
  findings: ValidationFinding[];
}

/**
 * @zh Documentation Subject 注册表——持有所有已验证的 SubjectIR。
 * @en Documentation Subject registry holding all validated SubjectIR objects.
 */
export class SubjectRegistry {
  private readonly _subjects: Map<string, SubjectIR>;
  private readonly _sections: Map<string, SectionIR>;

  constructor(subjects: SubjectIR[], sections: SectionIR[]) {
    this._subjects = new Map(subjects.map((s) => [s.id, s]));
    this._sections = new Map(sections.map((s) => [s.id, s]));
  }

  get subjects(): SubjectIR[] {
    return [...this._subjects.values()];
  }

  get sections(): SectionIR[] {
    return [...this._sections.values()].sort((a, b) => a.order - b.order);
  }

  findSubject(id: string): SubjectIR | undefined {
    return this._subjects.get(id);
  }

  findSection(id: string): SectionIR | undefined {
    return this._sections.get(id);
  }

  hasSubject(id: string): boolean {
    return this._subjects.has(id);
  }

  /** @zh 返回某 section 下所有公开 subject，按 ID 排序。
   * @en Return all public subjects in a section, sorted by ID. */
  subjectsBySection(sectionId: string): SubjectIR[] {
    return this.subjects
      .filter((s) => s.section.id === sectionId && s.public)
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}

/**
 * @zh 从 glob 模式加载所有 subject manifests，构建并返回注册表。
 * Manifest 解析错误和跨 manifest 约束违反都收集为 ValidationFinding。
 *
 * @en Load all subject manifests from glob patterns, build and return the registry.
 * Manifest parse errors and cross-manifest constraint violations are collected as ValidationFindings.
 */
export const loadRegistry = async (
  subjectGlobs: string | string[],
  sections: SectionIR[],
  workspaceRoot: string,
): Promise<RegistryLoadResult> => {
  const findings: ValidationFinding[] = [];
  const sectionMap = new Map(sections.map((s) => [s.id, s]));

  const patterns = Array.isArray(subjectGlobs) ? subjectGlobs : [subjectGlobs];
  const manifestFiles = (
    await glob(patterns, { cwd: workspaceRoot, absolute: true })
  ).sort();

  // ── 1. Parse each manifest ─────────────────────────────────────────────────
  const rawManifests: Array<{
    manifest: SubjectManifestConfig;
    filePath: string;
  }> = [];

  for (const filePath of manifestFiles) {
    const relPath = filePath.replace(workspaceRoot + "/", "");
    try {
      // oxlint-disable-next-line no-await-in-loop
      const mod: { default: unknown } = await import(
        pathToFileURL(filePath).href
      );
      const parsed = SubjectManifestConfigSchema.safeParse(mod.default);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          findings.push({
            severity: "error",
            tier: 1,
            code: "MANIFEST_PARSE_ERROR",
            message: `${relPath}: ${issue.path.join(".")} — ${issue.message}`,
            location: { file: relPath },
          });
        }
      } else {
        rawManifests.push({ manifest: parsed.data, filePath: relPath });
      }
    } catch (err) {
      findings.push({
        severity: "error",
        tier: 1,
        code: "MANIFEST_IMPORT_ERROR",
        message: `Failed to import manifest ${relPath}: ${String(err)}`,
        location: { file: relPath },
      });
    }
  }

  // ── 2. Cross-manifest validation ───────────────────────────────────────────
  const subjectIds = new Set<string>();
  const primaryOwners = new Map<string, string>(); // packageName → subjectId

  for (const { manifest, filePath } of rawManifests) {
    const relPath = filePath;

    // Unique subject ID
    if (subjectIds.has(manifest.id)) {
      findings.push({
        severity: "error",
        tier: 1,
        code: "DUPLICATE_SUBJECT_ID",
        message: `Duplicate subject ID "${manifest.id}" in ${relPath}`,
        location: { file: relPath },
      });
    } else {
      subjectIds.add(manifest.id);
    }

    // Section binding exists
    if (!sectionMap.has(manifest.section)) {
      findings.push({
        severity: "error",
        tier: 1,
        code: "SECTION_NOT_FOUND",
        message: `Subject "${manifest.id}" references unknown section "${manifest.section}" in ${relPath}`,
        location: { file: relPath },
      });
    }

    // Unique primary ownership
    const existingOwner = primaryOwners.get(manifest.primaryOwner);
    if (existingOwner) {
      findings.push({
        severity: "error",
        tier: 1,
        code: "PRIMARY_OWNER_CONFLICT",
        message: `Package "${manifest.primaryOwner}" is claimed as primary owner by both "${existingOwner}" and "${manifest.id}" (${relPath})`,
        location: { file: relPath },
      });
    } else {
      primaryOwners.set(manifest.primaryOwner, manifest.id);
    }
  }

  // ── 3. Dependency existence check ─────────────────────────────────────────
  for (const { manifest, filePath } of rawManifests) {
    for (const depId of manifest.dependsOn) {
      if (!subjectIds.has(depId)) {
        findings.push({
          severity: "error",
          tier: 1,
          code: "DEPENDENCY_NOT_FOUND",
          message: `Subject "${manifest.id}" depends on unknown subject "${depId}" in ${filePath}`,
          location: { file: filePath },
        });
      }
    }
  }

  // ── 4. Build SubjectIR[] (only for successfully parsed manifests with valid sections) ──
  const errorSubjectIds = new Set(
    findings
      .filter(
        (f) =>
          f.code === "DUPLICATE_SUBJECT_ID" || f.code === "SECTION_NOT_FOUND",
      )
      .map((f) => {
        // Extract subject id from message if possible
        const match = f.message.match(/Subject "([^"]+)"/);
        return match?.[1] ?? "";
      })
      .filter(Boolean),
  );

  const subjects: SubjectIR[] = [];
  for (const { manifest, filePath } of rawManifests) {
    if (errorSubjectIds.has(manifest.id)) continue;
    const section = sectionMap.get(manifest.section);
    if (!section) continue;
    subjects.push(buildSubjectIR(manifest, section, filePath));
  }

  const registry = new SubjectRegistry(subjects, sections);
  return { registry, findings };
};

/**
 * @zh 构建 package → subject 归属索引。
 * @en Build a package → subject membership index.
 */
export const buildMembershipIndex = (
  registry: SubjectRegistry,
): MembershipIR[] => {
  const memberships: MembershipIR[] = [];
  for (const subject of registry.subjects) {
    memberships.push({
      packageName: subject.primaryOwner,
      subjectId: subject.id,
      role: "primary",
    });
    for (const pkg of subject.secondaryAssociations) {
      memberships.push({
        packageName: pkg,
        subjectId: subject.id,
        role: "secondary",
      });
    }
  }
  return memberships;
};
