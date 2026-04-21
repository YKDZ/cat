import { resolve } from "node:path";

import type { AutodocConfig } from "../types.js";
import type { ValidationFinding } from "./findings.js";
import type { SubjectRegistry } from "../subjects/registry.js";
import type { ReferenceCatalog } from "../reference/compiler.js";
import type { SemanticCatalog } from "../semantic/ir.js";
import type { SectionIR } from "../subjects/ir.js";

import { loadSections } from "../subjects/sections.js";
import { loadRegistry } from "../subjects/registry.js";
import { validateStructural } from "./structural.js";
import { validateReferenceHealth } from "./reference-health.js";
import { validatePublication } from "./publication.js";

export interface ValidationRunOptions {
  /** @zh 仅运行指定的 tier，默认运行所有 tier。 @en Run only the specified tiers. Defaults to all. */
  tiers?: Array<1 | 2 | 3>;
  /** @zh 来自 Reference Compiler 的 catalog（Tier-2 所需） @en Reference catalog (required for Tier-2) */
  referenceCatalog?: ReferenceCatalog | null;
  /** @zh 来自 Semantic Compiler 的 catalog（Tier-3 所需） @en Semantic catalog (required for Tier-3) */
  semanticCatalog?: SemanticCatalog | null;
  /**
   * @zh 已存在的输出路径集合（相对于 output.path）（Tier-3 所需）。
   * @en Set of existing output paths (relative to output.path), required for Tier-3.
   */
  existingOutputPaths?: Set<string>;
}

export interface ValidationRunResult {
  findings: ValidationFinding[];
  registry: SubjectRegistry | null;
  sections: SectionIR[] | null;
}

/**
 * @zh 运行分层校验（Tier-1 结构、Tier-2 引用健康、Tier-3 发布完整性）。
 * @en Run layered validation (Tier-1 structural, Tier-2 reference health, Tier-3 publication integrity).
 */
export const runValidation = async (
  config: AutodocConfig,
  workspaceRoot: string,
  options: ValidationRunOptions = {},
): Promise<ValidationRunResult> => {
  const requestedTiers = options.tiers ?? [1, 2, 3];
  const allFindings: ValidationFinding[] = [];

  // ── Load sections ──────────────────────────────────────────────────────────
  if (!config.sections) {
    allFindings.push({
      severity: "warning",
      tier: 1,
      code: "NO_SECTIONS_CONFIG",
      message: "No sections config path specified; subject section binding cannot be validated",
      location: undefined,
    });
    return { findings: allFindings, registry: null, sections: null };
  }

  const sectionsPath = resolve(workspaceRoot, config.sections);
  let sections: SectionIR[];
  try {
    sections = await loadSections(sectionsPath);
  } catch (err) {
    allFindings.push({
      severity: "error",
      tier: 1,
      code: "SECTIONS_LOAD_ERROR",
      message: `Failed to load sections config at "${config.sections}": ${String(err)}`,
      location: { file: config.sections },
    });
    return { findings: allFindings, registry: null, sections: null };
  }

  // ── Skip Tier-1 if not requested ───────────────────────────────────────────
  if (!requestedTiers.includes(1)) {
    return { findings: allFindings, registry: null, sections };
  }

  // ── Load subject registry (collects parse findings internally) ─────────────
  if (!config.subjects) {
    allFindings.push({
      severity: "warning",
      tier: 1,
      code: "NO_SUBJECTS_GLOB",
      message: "No subjects glob specified; subject manifest validation skipped",
      location: undefined,
    });
    return { findings: allFindings, registry: null, sections };
  }

  const { registry, findings: registryFindings } = await loadRegistry(
    config.subjects,
    sections,
    workspaceRoot,
  );
  allFindings.push(...registryFindings);

  // ── Tier-1 structural validation ───────────────────────────────────────────
  const knownPackageNames = new Set(config.packages.map((p) => p.name));
  const structuralFindings = validateStructural(registry, knownPackageNames);
  allFindings.push(...structuralFindings);

  // ── Tier-2: Reference health ───────────────────────────────────────────────
  if (requestedTiers.includes(2) && options.referenceCatalog) {
    const tier2Findings = validateReferenceHealth(registry, options.referenceCatalog);
    allFindings.push(...tier2Findings);
  }

  // ── Tier-3: Publication integrity ─────────────────────────────────────────
  if (
    requestedTiers.includes(3) &&
    options.semanticCatalog &&
    options.existingOutputPaths
  ) {
    const tier3Findings = validatePublication(
      registry,
      sections,
      options.semanticCatalog,
      options.existingOutputPaths,
    );
    allFindings.push(...tier3Findings);
  }

  return { findings: allFindings, registry, sections };
};
