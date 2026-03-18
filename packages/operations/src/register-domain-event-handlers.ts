import { domainEventBus, type DomainEventMap } from "@cat/domain";
import { serverLogger as logger } from "@cat/server-shared";

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
      logger
        .withSituation("SERVER")
        .error({ msg: "Failed to handle concept:updated event" }, error);
    }
  });

  registered = true;
};
