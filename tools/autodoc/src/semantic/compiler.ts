import type { ReferenceCatalog } from "../reference/compiler.js";
import type { SubjectRegistry } from "../subjects/registry.js";
import type { ValidationFinding } from "../validation/findings.js";
import type { SemanticFragment, SemanticCatalog } from "./ir.js";

// ── Language detection ─────────────────────────────────────────────────────────

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const LATIN_WORD_RE = /[a-zA-Z]{4,}/g;

/**
 * @zh 简单检测文本主语言：CJK 字符比例 > 10% → zh；latin word 比例过高 → en；其余 → mixed。
 * @en Simple primary-language detection: CJK > 10% → zh; heavy latin words → en; else mixed.
 */
const detectPrimaryLanguage = (text: string): "zh" | "en" | "mixed" => {
  if (!text.trim()) return "mixed";
  const cjkCount = Array.from(text).filter((ch) => CJK_RE.test(ch)).length;
  if (cjkCount / text.length > 0.1) return "zh";
  const latinWords = text.match(LATIN_WORD_RE)?.length ?? 0;
  const wordRatio = latinWords / Math.max(text.split(/\s+/).length, 1);
  if (wordRatio > 0.6) return "en";
  return "mixed";
};

// ── Internal catalog implementation ───────────────────────────────────────────

class SemanticCatalogImpl implements SemanticCatalog {
  private readonly _map: Map<string, SemanticFragment[]>;

  constructor(fragments: SemanticFragment[]) {
    this._map = new Map();
    for (const frag of fragments) {
      const list = this._map.get(frag.subjectId) ?? [];
      list.push(frag);
      this._map.set(frag.subjectId, list);
    }
  }

  getFragments(subjectId: string): SemanticFragment[] {
    return this._map.get(subjectId) ?? [];
  }

  subjectIds(): string[] {
    return Array.from(this._map.keys());
  }

  get fragmentCount(): number {
    let count = 0;
    for (const frags of this._map.values()) count += frags.length;
    return count;
  }
}

// ── Validation helpers ─────────────────────────────────────────────────────────

export interface SemanticValidationOptions {
  validatePrimaryLanguage?: boolean;
}

const validateFragments = (
  fragments: SemanticFragment[],
  registry: SubjectRegistry | null,
  catalog: ReferenceCatalog | null,
  options: SemanticValidationOptions,
): ValidationFinding[] => {
  const findings: ValidationFinding[] = [];
  const knownSubjectIds = new Set(registry?.subjects.map((s) => s.id) ?? []);

  const seenPerSubject = new Map<string, Map<string, string>>();

  for (const frag of fragments) {
    // 1. Subject binding must resolve
    if (knownSubjectIds.size > 0 && !knownSubjectIds.has(frag.subjectId)) {
      findings.push({
        severity: "error",
        tier: 2,
        code: "UNRESOLVED_SUBJECT_BINDING",
        message: `Fragment at "${frag.sourcePath}:${frag.startLine}" binds to unknown subject "${frag.subjectId}"`,
        location: { file: frag.sourcePath, line: frag.startLine },
      });
    }

    // 2. Language contract: opt-in warning for English-dominant fragments
    if (options.validatePrimaryLanguage) {
      const lang = detectPrimaryLanguage(frag.body);
      if (lang === "en") {
        findings.push({
          severity: "warning",
          tier: 2,
          code: "FRAGMENT_ENGLISH_DOMINANT",
          message: `Fragment at "${frag.sourcePath}:${frag.startLine}" (subject: "${frag.subjectId}") appears to be primarily English. The semantic layer should contain Chinese content.`,
          location: { file: frag.sourcePath, line: frag.startLine },
        });
      }
    }

    // 3. Duplicate body per subject (same source file + same subject)
    const subjectMap =
      seenPerSubject.get(frag.subjectId) ?? new Map<string, string>();
    const conflictKey = frag.sourcePath;
    if (subjectMap.has(conflictKey)) {
      findings.push({
        severity: "warning",
        tier: 2,
        code: "DUPLICATE_FRAGMENT",
        message: `Subject "${frag.subjectId}" has multiple fragments from the same source file "${frag.sourcePath}"`,
        location: { file: frag.sourcePath, line: frag.startLine },
      });
    }
    subjectMap.set(conflictKey, frag.sourcePath);
    seenPerSubject.set(frag.subjectId, subjectMap);

    // 4. Validate referenced stableKeys against reference catalog
    if (catalog) {
      for (const key of frag.referencedStableKeys) {
        const resolved = catalog.resolveByStableKey(key);
        if (!resolved) {
          findings.push({
            severity: "warning",
            tier: 2,
            code: "UNRESOLVED_STABLE_KEY",
            message: `Fragment at "${frag.sourcePath}:${frag.startLine}" references unknown stableKey "${key}"`,
            location: { file: frag.sourcePath, line: frag.startLine },
          });
        }
      }
    }
  }

  return findings;
};

// ── Public API ─────────────────────────────────────────────────────────────────

export interface SemanticCompilerResult {
  catalog: SemanticCatalog;
  findings: ValidationFinding[];
}

/**
 * @zh 构建语义 catalog，对 fragment 做 subject binding / language / stableKey 交叉校验。
 * @en Build the semantic catalog, cross-validating fragment binding, language, and stableKey references.
 */
export const buildSemanticCatalog = (
  fragments: SemanticFragment[],
  registry: SubjectRegistry | null = null,
  referenceCatalog: ReferenceCatalog | null = null,
  options: SemanticValidationOptions = {},
): SemanticCompilerResult => {
  const findings = validateFragments(
    fragments,
    registry,
    referenceCatalog,
    options,
  );
  const catalog = new SemanticCatalogImpl(fragments);
  return { catalog, findings };
};
