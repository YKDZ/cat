import { domainEventBus, type DomainEventMap } from "@cat/domain";
import { logger } from "@cat/shared/utils";

import { triggerConceptRevectorize } from "./trigger-revectorize";

let registered = false;

const onConceptUpdated = async (
  payload: DomainEventMap["concept:updated"],
): Promise<void> => {
  triggerConceptRevectorize(payload.conceptId);
};

export const registerDomainEventHandlers = (): void => {
  if (registered) {
    return;
  }

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
