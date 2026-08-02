import type { OperationContext } from "@cat/domain";
import {
  resolvePluginManager,
  selectFirstServiceImplementation,
  serverLogger as logger,
} from "@cat/server-shared";

import { revectorizeConceptOp } from "./revectorize-concept.ts";

export const triggerConceptRevectorize = (
  conceptId: number,
  ctx?: OperationContext,
): void => {
  const pluginManager = resolvePluginManager(ctx?.pluginManager);
  const vectorizer = selectFirstServiceImplementation(
    pluginManager,
    "TEXT_VECTORIZER",
  );
  const storage = selectFirstServiceImplementation(
    pluginManager,
    "VECTOR_STORAGE",
  );
  if (!vectorizer || !storage) return;

  void revectorizeConceptOp(
    {
      conceptId,
      vectorizer: vectorizer.reference,
      vectorStorage: storage.reference,
    },
    ctx,
  ).catch((error: unknown) => {
    logger
      .child({ component: "operation" })
      .error(`Failed to revectorize concept ${conceptId}`, { error });
  });
};
