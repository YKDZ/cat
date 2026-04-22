import { pathToFileURL } from "node:url";

import type { SectionIR } from "./ir.js";

import { SectionsFileSchema } from "./ir.js";

/**
 * @zh 从磁盘加载 sections 文件，用 Zod 验证后返回 SectionIR[]。
 * @en Load a sections file from disk, validate with Zod, and return SectionIR[].
 */
export const loadSections = async (
  absolutePath: string,
): Promise<SectionIR[]> => {
  const module: { default: unknown } = await import(
    pathToFileURL(absolutePath).href
  );
  return SectionsFileSchema.parse(module.default);
};
