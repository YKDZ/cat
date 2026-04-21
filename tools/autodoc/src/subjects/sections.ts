import { pathToFileURL } from "node:url";

import type { SectionIR } from "./ir.js";

import { SectionsFileSchema } from "./ir.js";

/**
 * @zh 从磁盘加载 sections.config.ts，用 Zod 验证后返回 SectionIR[]。
 * @en Load sections.config.ts from disk, validate with Zod, and return SectionIR[].
 */
export const loadSections = async (
  absolutePath: string,
): Promise<SectionIR[]> => {
  const module: { default: unknown } = await import(
    pathToFileURL(absolutePath).href
  );
  return SectionsFileSchema.parse(module.default);
};
