import type {
  SubjectManifestConfig,
  PublicationMemberConfig,
  SectionConfig,
} from "../types.js";

import { SectionConfigSchema, SectionsFileSchema } from "../types.js";

// ── Section IR (re-exported from types for backward compatibility) ─────────────

/** @zh Section 的运行时表示（与 SectionConfig 同形）@en Runtime representation of a section (same shape as SectionConfig) */
export type SectionIR = SectionConfig;
export { SectionConfigSchema as SectionIRSchema, SectionsFileSchema };
export type { SectionsFile } from "../types.js";

// ── Publication member IR ──────────────────────────────────────────────────────

/**
 * @zh 经过 registry 校验的发布成员。
 * @en A publication member after registry validation.
 */
export interface PublicationMemberIR {
  type: PublicationMemberConfig["type"];
  ref: string;
}

// ── Subject IR (resolved from manifest + sections) ────────────────────────────

/**
 * @zh 经过 registry 解析与校验的 Documentation Subject。
 * @en A Documentation Subject after registry resolution and validation.
 */
export interface SubjectIR {
  /** @zh 全局唯一 subject ID @en Globally unique subject ID */
  id: string;
  /** @zh 双语标题 @en Bilingual title */
  title: { zh: string; en: string };
  /** @zh 所属 section（已解析） @en Owning section (resolved) */
  section: SectionIR;
  /** @zh 主 owner package 名称 @en Primary owner package name */
  primaryOwner: string;
  /** @zh 次要关联 package 名称列表 @en Secondary association package names */
  secondaryAssociations: string[];
  /** @zh 发布成员列表 @en Publication members */
  members: PublicationMemberIR[];
  /** @zh 语义片段来源列表 @en Semantic fragment source patterns */
  semanticFragments: string[];
  /** @zh 依赖的其他 subject ID @en Dependency subject IDs */
  dependsOn: string[];
  /** @zh 是否公开 @en Whether public */
  public: boolean;
  /** @zh 原始 manifest 文件路径（相对于 workspace root） @en Manifest file path (relative to workspace root) */
  manifestPath: string;
}

// ── Membership IR ──────────────────────────────────────────────────────────────

/**
 * @zh package → subject 的归属映射。
 * @en Mapping from a package to its subject.
 */
export interface MembershipIR {
  /** @zh package 名称 @en Package name */
  packageName: string;
  /** @zh 所属 subject ID @en Owning subject ID */
  subjectId: string;
  /** @zh 归属角色（primary 或 secondary） @en Membership role */
  role: "primary" | "secondary";
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * @zh 从 SubjectManifestConfig 构造轻量 SubjectIR（section 字段需调用方注入）。
 * @en Build a lightweight SubjectIR from a SubjectManifestConfig; caller must inject the section.
 */
export const buildSubjectIR = (
  manifest: SubjectManifestConfig,
  section: SectionIR,
  manifestPath: string,
): SubjectIR => ({
  id: manifest.id,
  title: manifest.title,
  section,
  primaryOwner: manifest.primaryOwner,
  secondaryAssociations: manifest.secondaryAssociations,
  members: manifest.members as PublicationMemberIR[],
  semanticFragments: manifest.semanticFragments,
  dependsOn: manifest.dependsOn,
  public: manifest.public,
  manifestPath,
});
