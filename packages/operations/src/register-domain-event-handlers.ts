import { getRedisDB } from "@cat/db";
import { domainEventBus, type DomainEventMap } from "@cat/domain";
import { logger } from "@cat/shared/utils";

import { getCreateTranslationPubKey } from "./create-translation";
import { triggerConceptRevectorize } from "./trigger-revectorize";

let registered = false;

const onTranslationCreated = async (
  payload: DomainEventMap["translation:created"],
): Promise<void> => {
  const { redisPub } = await getRedisDB();
  await redisPub.publish(
    getCreateTranslationPubKey(payload.documentId),
    JSON.stringify({ translationIds: payload.translationIds }),
  );
};

const onConceptUpdated = async (
  payload: DomainEventMap["concept:updated"],
): Promise<void> => {
  triggerConceptRevectorize(payload.conceptId);
};

export const registerDomainEventHandlers = (): void => {
  if (registered) {
    return;
  }

  domainEventBus.subscribe("translation:created", async (event) => {
    try {
      await onTranslationCreated(event.payload);
    } catch (error) {
      logger.error(
        "SERVER",
        { msg: "Failed to handle translation:created event" },
        error,
      );
    }
  });

  domainEventBus.subscribe("concept:updated", async (event) => {
    try {
      await onConceptUpdated(event.payload);
    } catch (error) {
      logger.error(
        "SERVER",
        { msg: "Failed to handle concept:updated event" },
        error,
      );
    }
  });

  registered = true;
};
