import {
  StructuredContentPayloadSchema,
  type StructuredContentPayload,
} from "@cat/shared";

import type {
  PayloadRoutingOptions,
  SourceExtractionGraphResult,
} from "./types.ts";

/**
 * @zh 将 SourceExtractionGraphResult 与平台路由参数组装为 StructuredContentPayload。
 * @en Assemble SourceExtractionGraphResult + platform routing into StructuredContentPayload.
 */
export function toCollectionPayload(
  result: SourceExtractionGraphResult,
  routing: PayloadRoutingOptions,
): StructuredContentPayload {
  return StructuredContentPayloadSchema.parse({
    payloadVersion: "content-graph/v1",
    projectId: routing.projectId,
    sourceLanguageId: routing.sourceLanguageId,
    importerId: result.importerId,
    sourceRootRef: routing.sourceRootRef,
    relationTypes: result.relationTypes,
    nodes: result.nodes,
    elements: result.elements,
    relations: result.relations,
    evidence: result.evidence,
    options: routing.options,
  });
}
