import type { StructuredContentPayload } from "@cat/shared";

import { toCollectionPayload } from "#/adapter.ts";
import { extract } from "#/extract.ts";
import type { CollectOptions } from "#/types.ts";

/**
 * Collect translatable elements from source files and return a StructuredContentPayload.
 *
 * @param options - Collection options
 * @returns - Structured content payload
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

  const result = await extract({
    globs,
    extractors,
    baseDir,
    sourceLanguageId,
  });

  return toCollectionPayload(result, {
    projectId,
    sourceLanguageId,
    sourceRootRef: sourceRootRef,
  });
}
