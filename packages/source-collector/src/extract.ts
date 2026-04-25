// oxlint-disable no-console
import type { CollectionContext } from "@cat/shared";
import type { ExtractionResult } from "@cat/shared";

import { glob } from "glob";
import { readFile } from "node:fs/promises";
import { extname, relative } from "node:path";

import type { SourceExtractOptions } from "./types.ts";

/**
 * @zh 从源文件中纯粹提取可翻译元素，返回 ExtractionResult（不含平台参数）。
 * @en Extract translatable elements from source files, returning ExtractionResult (no platform params).
 */
export async function extract(
  options: SourceExtractOptions,
): Promise<ExtractionResult> {
  const { globs, extractors, baseDir } = options;

  const files = (await glob(globs, { cwd: baseDir, absolute: true })).sort();

  const extMap = new Map<string, (typeof extractors)[number]>();
  for (const ext of extractors) {
    for (const supportedExt of ext.supportedExtensions) {
      if (!extMap.has(supportedExt)) {
        extMap.set(supportedExt, ext);
      }
    }
  }

  const allElements: ExtractionResult["elements"] = [];
  const allContexts: CollectionContext[] = [];

  const results = await Promise.all(
    files.map(async (absPath) => {
      const relPath = relative(baseDir, absPath);
      const ext = extname(absPath);

      const extractor = extMap.get(ext);
      if (!extractor) return null;

      let content: string;
      try {
        content = await readFile(absPath, "utf-8");
      } catch (err) {
        console.warn(
          `[WARN] Failed to read ${relPath}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      }

      let elements: ExtractionResult["elements"];
      try {
        elements = extractor.extract({ content, filePath: relPath });
      } catch (err) {
        console.warn(
          `[WARN] Extraction failed for ${relPath}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      }

      const fileElements: ExtractionResult["elements"] = [];
      const fileContexts: CollectionContext[] = [];

      for (const el of elements) {
        fileElements.push(el);

        fileContexts.push({
          elementRef: el.ref,
          type: "TEXT",
          data: { text: `Source: ${relPath}` },
        });

        const i18nCtx = el.location?.custom?.["i18nContext"];
        if (typeof i18nCtx === "string") {
          fileContexts.push({
            elementRef: el.ref,
            type: "TEXT",
            data: { text: i18nCtx },
          });
        }
      }

      return { elements: fileElements, contexts: fileContexts };
    }),
  );

  for (const result of results) {
    if (!result) continue;
    allElements.push(...result.elements);
    allContexts.push(...result.contexts);
  }

  return {
    elements: allElements,
    contexts: allContexts,
    metadata: {
      extractorIds: extractors.map((e) => e.id),
      baseDir,
      timestamp: new Date().toISOString(),
    },
  };
}
