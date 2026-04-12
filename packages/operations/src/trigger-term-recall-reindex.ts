import type { OperationContext } from "@cat/domain";

import { serverLogger as logger } from "@cat/server-shared";

import { buildTermRecallVariantsOp } from "./build-term-recall-variants";

/**
 * Fire-and-forget wrapper around `buildTermRecallVariantsOp`.
 *
 * Called from the `concept:updated` domain event handler to keep
 * `TermRecallVariant` rows fresh after any term content change.
 *
 * Errors are logged but do not propagate (graceful degradation).
 */
export const triggerTermRecallReindex = (
  conceptId: number,
  ctx?: OperationContext,
): void => {
  void buildTermRecallVariantsOp({ conceptId }, ctx).catch((err: unknown) => {
    logger
      .withSituation("OP")
      .error(
        err,
        `Failed to reindex term recall variants for concept ${conceptId}`,
      );
  });
};
