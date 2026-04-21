import type { SectionIR, SubjectIR } from "../subjects/ir.js";

/**
 * @zh 为单个公开 section 生成 index.md 内容。
 * @en Generate index.md content for a single public section.
 */
export const buildSectionIndex = (
  section: SectionIR,
  subjects: SubjectIR[],
): string => {
  const sectionSubjects = subjects
    .filter((s) => s.section.id === section.id && s.public)
    .sort((a, b) => a.title.zh.localeCompare(b.title.zh, "zh"));

  const lines: string[] = [];
  lines.push(`# ${section.title.zh} / ${section.title.en}`);
  lines.push("");
  lines.push(`> Section ID: \`${section.id}\``);
  lines.push("");

  if (sectionSubjects.length === 0) {
    lines.push("*（本 section 暂无发布主题）*");
    return lines.join("\n");
  }

  lines.push("## 主题列表 / Topics");
  lines.push("");
  lines.push("| 主题 | English | Subject ID |");
  lines.push("| ---- | ------- | ---------- |");
  for (const subject of sectionSubjects) {
    const subjectSlug = subject.id.replace(/\//g, "--");
    lines.push(
      `| [${subject.title.zh}](./${subjectSlug}.zh.md) | [${subject.title.en}](./${subjectSlug}.en.md) | \`${subject.id}\` |`,
    );
  }
  lines.push("");

  return lines.join("\n");
};

/**
 * @zh 为所有公开 section 生成 section → index.md 映射。
 * @en Generate a map of section ID → index.md content for all public sections.
 */
export const buildAllSectionIndexes = (
  sections: SectionIR[],
  subjects: SubjectIR[],
): Map<string, string> => {
  const result = new Map<string, string>();
  for (const section of sections.filter((s) => s.public)) {
    result.set(section.id, buildSectionIndex(section, subjects));
  }
  return result;
};
