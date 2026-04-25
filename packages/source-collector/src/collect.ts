// oxlint-disable no-console
import type { CollectionPayload } from "@cat/shared";

import type { CollectOptions } from "./types.ts";

import { toCollectionPayload } from "./adapter.ts";
import { extract } from "./extract.ts";

/**
 * @zh 从源文件中采集可翻译元素，返回 CollectionPayload。
 * @en Collect translatable elements from source files and return a CollectionPayload.
 */
export async function collect(
  options: CollectOptions,
): Promise<CollectionPayload> {
  const {
    globs,
    extractors,
    baseDir,
    projectId,
    sourceLanguageId,
    documentName,
  } = options;

  const result = await extract({ globs, extractors, baseDir });

  return toCollectionPayload(result, {
    projectId,
    sourceLanguageId,
    documentName,
  });
}
