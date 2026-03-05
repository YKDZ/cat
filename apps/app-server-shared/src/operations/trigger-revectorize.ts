import { PluginManager } from "@cat/plugin-core";
import { logger } from "@cat/shared/utils";

import type { OperationContext } from "@/operations/types";

import { firstOrGivenService } from "@/utils";

import { revectorizeConceptOp } from "./revectorize-concept";

/**
 * 解析当前可用的 TEXT_VECTORIZER / VECTOR_STORAGE 插件，
 * 如果两者均就绪，则以 fire-and-forget 方式触发概念重向量化。
 *
 * 若任一插件不可用，则静默跳过（graceful degradation）。
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
    logger.error(
      "OP",
      { msg: `Failed to revectorize concept ${conceptId}` },
      err,
    );
  });
};
