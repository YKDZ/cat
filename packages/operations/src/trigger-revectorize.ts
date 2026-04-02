import type { OperationContext } from "@cat/domain";

import { PluginManager } from "@cat/plugin-core";
import { firstOrGivenService } from "@cat/server-shared";
import { serverLogger as logger } from "@cat/server-shared";

import { revectorizeConceptOp } from "./revectorize-concept";

/**
 * @zh 解析当前可用的 TEXT_VECTORIZER / VECTOR_STORAGE 插件，
 * 如果两者均就绪，则以 fire-and-forget 方式触发概念重向量化。
 *
 * 若任一插件不可用，则静默跳过（优雅降级）。
 * @en Resolve the current TEXT_VECTORIZER / VECTOR_STORAGE plugins and
 * trigger concept re-vectorization in a fire-and-forget manner when both
 * are available.
 *
 * Silently skips when either plugin is unavailable (graceful degradation).
 *
 * @param conceptId - {@zh 要重向量化的 termConcept ID} {@en ID of the termConcept to re-vectorize}
 * @param ctx - {@zh 操作上下文} {@en Operation context}
 */
export const triggerConceptRevectorize = (
  conceptId: number,
  ctx?: OperationContext,
): void => {
  const pluginManager = PluginManager.get("GLOBAL", "");
  const vectorizer = firstOrGivenService(pluginManager, "TEXT_VECTORIZER");
  const storage = firstOrGivenService(pluginManager, "VECTOR_STORAGE");

  if (!vectorizer || !storage) return;

  void revectorizeConceptOp(
    { conceptId, vectorizerId: vectorizer.id, vectorStorageId: storage.id },
    ctx,
  ).catch((err: unknown) => {
    logger
      .withSituation("OP")
      .error(err, `Failed to revectorize concept ${conceptId}`);
  });
};
