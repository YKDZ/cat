import type { SubjectIR } from "../subjects/ir.js";
import type { SemanticCatalog } from "../semantic/ir.js";
import type { ReferenceCatalog } from "../reference/compiler.js";

/**
 * @zh 单个 subject 的成对页面内容（ZH + EN）。
 * @en Paired page content (ZH + EN) for a single subject.
 */
export interface PairedPage {
  /** @zh ZH 页 Markdown 内容 @en ZH page Markdown content */
  zhContent: string;
  /** @zh EN 页 Markdown 内容 @en EN page Markdown content */
  enContent: string;
  /**
   * @zh 目标路径（相对于 output.path），不含扩展名，后缀由调用方指定。
   * @en Target path (relative to output.path), without extension — caller appends .md.
   */
  basePath: string;
}

// ── ZH page builder ────────────────────────────────────────────────────────────

const buildZhPage = (
  subject: SubjectIR,
  semanticCatalog: SemanticCatalog,
): string => {
  const lines: string[] = [];
  lines.push(`# ${subject.title.zh}`);
  lines.push("");
  lines.push(
    `> **Section**: ${subject.section.title.zh}  ·  **Subject ID**: \`${subject.id}\``,
  );
  lines.push("");

  const fragments = semanticCatalog.getFragments(subject.id);
  if (fragments.length > 0) {
    for (const frag of fragments) {
      if (frag.title) {
        lines.push(`## ${frag.title}`);
        lines.push("");
      }
      lines.push(frag.body);
      lines.push("");
    }
  } else {
    lines.push("*（暂无语义描述）*");
    lines.push("");
  }

  // Related subjects
  if (subject.dependsOn.length > 0) {
    lines.push("## 相关主题");
    lines.push("");
    for (const dep of subject.dependsOn) {
      lines.push(`- [\`${dep}\`](../${dep.split("/").pop()}.zh.md)`);
    }
    lines.push("");
  }

  return lines.join("\n");
};

// ── EN page builder ────────────────────────────────────────────────────────────

const buildEnPage = (
  subject: SubjectIR,
  referenceCatalog: ReferenceCatalog,
): string => {
  const lines: string[] = [];
  lines.push(`# ${subject.title.en}`);
  lines.push("");
  lines.push(
    `> **Section**: ${subject.section.title.en}  ·  **Subject ID**: \`${subject.id}\``,
  );
  lines.push("");

  // Primary owner
  lines.push(`**Primary package**: \`${subject.primaryOwner}\``);
  if (subject.secondaryAssociations.length > 0) {
    lines.push(
      `**Also covers**: ${subject.secondaryAssociations.map((s) => `\`${s}\``).join(", ")}`,
    );
  }
  lines.push("");

  // Symbol reference table — collect from primaryOwner and secondaryAssociations
  const pkgs = [subject.primaryOwner, ...subject.secondaryAssociations];
  const subjectSymbols = referenceCatalog.packages
    .filter((p) =>
      pkgs.includes(p.name),
    )
    .flatMap((p) => p.modules.flatMap((m) => m.symbols));

  if (subjectSymbols.length > 0) {
    lines.push("## API Reference");
    lines.push("");
    lines.push("| Symbol | Kind | Description |");
    lines.push("| ------ | ---- | ----------- |");
    for (const sym of subjectSymbols.slice(0, 50)) {
      const desc = sym.description
        ? sym.description.replace(/\|/g, "\\|").slice(0, 80)
        : "";
      lines.push(`| \`${sym.name}\` | ${sym.kind} | ${desc} |`);
    }
    if (subjectSymbols.length > 50) {
      lines.push(`| *(${subjectSymbols.length - 50} more)* | | |`);
    }
    lines.push("");
  }

  // Related subjects
  if (subject.dependsOn.length > 0) {
    lines.push("## Related Topics");
    lines.push("");
    for (const dep of subject.dependsOn) {
      lines.push(`- [\`${dep}\`](../${dep.split("/").pop()}.en.md)`);
    }
    lines.push("");
  }

  return lines.join("\n");
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * @zh 为单个 subject 生成成对的 ZH/EN Markdown 页面。
 * @en Generate a ZH/EN paired Markdown page pair for a single subject.
 */
export const buildPairedPage = (
  subject: SubjectIR,
  semanticCatalog: SemanticCatalog,
  referenceCatalog: ReferenceCatalog,
): PairedPage => {
  const basePath = `${subject.section.id}/${subject.id.replace(/\//g, "--")}`;
  return {
    zhContent: buildZhPage(subject, semanticCatalog),
    enContent: buildEnPage(subject, referenceCatalog),
    basePath,
  };
};

/**
 * @zh 为 subject 列表批量生成成对页面。
 * @en Generate paired pages for a list of subjects.
 */
export const buildAllPairedPages = (
  subjects: SubjectIR[],
  semanticCatalog: SemanticCatalog,
  referenceCatalog: ReferenceCatalog,
): PairedPage[] =>
  subjects
    .filter((s) => s.public)
    .map((subject) =>
      buildPairedPage(subject, semanticCatalog, referenceCatalog),
    );
