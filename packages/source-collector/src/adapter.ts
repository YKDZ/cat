import type { CollectionPayload } from "@cat/shared/schema/collection";
import type { ExtractionResult } from "@cat/shared/schema/extraction";

import type { PayloadRoutingOptions } from "./types.ts";

/**
 * @zh 将 ExtractionResult 与平台路由参数组装为 CollectionPayload。
 * @en Assemble ExtractionResult + platform routing into CollectionPayload.
 */
export function toCollectionPayload(
  result: ExtractionResult,
  routing: PayloadRoutingOptions,
): CollectionPayload {
  return {
    projectId: routing.projectId,
    sourceLanguageId: routing.sourceLanguageId,
    document: {
      name: routing.documentName,
      ...(routing.fileHandlerId
        ? { fileHandlerId: routing.fileHandlerId }
        : {}),
    },
    elements: result.elements,
    contexts: result.contexts,
    ...(routing.options ? { options: routing.options } : {}),
  };
}
