import type { StructuredContentPayload } from "@cat/shared";

import type { CollectOptions } from "./types.ts";

import { toCollectionPayload } from "./adapter.ts";
import { extract } from "./extract.ts";

/**
 * @zh 从源文件中采集可翻译元素，返回 StructuredContentPayload。
 * @en Collect translatable elements from source files and return a StructuredContentPayload.
 */
export async function collect(
  options: CollectOptions,
): Promise<StructuredContentPayload> {
  const {
    globs,
    extractors,
    baseDir,
    projectId,
    sourceLanguageId,
    sourceRootRef,
  } = options;

  const result = await extract({ globs, extractors, baseDir });

  return toCollectionPayload(result, {
    projectId,
    sourceLanguageId,
    sourceRootRef: sourceRootRef,
  });
}
