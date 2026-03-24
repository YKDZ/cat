import { domainEventBus, type DomainEventMap } from "@cat/domain";
import { getPermissionEngine } from "@cat/permissions";
import { serverLogger as logger } from "@cat/server-shared";

import { triggerConceptRevectorize } from "./trigger-revectorize";

let registered = false;

const onConceptUpdated = async (
  payload: DomainEventMap["concept:updated"],
): Promise<void> => {
  triggerConceptRevectorize(payload.conceptId);
};

const onProjectCreated = async (
  payload: DomainEventMap["project:created"],
): Promise<void> => {
  const engine = getPermissionEngine();
  await engine.grant({ type: "user", id: payload.creatorId }, "owner", {
    type: "project",
    id: payload.projectId,
  });
};

const onGlossaryCreated = async (
  payload: DomainEventMap["glossary:created"],
): Promise<void> => {
  const engine = getPermissionEngine();
  await engine.grant({ type: "user", id: payload.creatorId }, "owner", {
    type: "glossary",
    id: payload.glossaryId,
  });
};

const onMemoryCreated = async (
  payload: DomainEventMap["memory:created"],
): Promise<void> => {
  const engine = getPermissionEngine();
  await engine.grant({ type: "user", id: payload.creatorId }, "owner", {
    type: "memory",
    id: payload.memoryId,
  });
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
        .error(error, "Failed to handle concept:updated event");
    }
  });

  domainEventBus.subscribe("project:created", async (event) => {
    try {
      await onProjectCreated(event.payload);
    } catch (error) {
      logger
        .withSituation("SERVER")
        .error(error, "Failed to handle project:created event");
    }
  });

  domainEventBus.subscribe("glossary:created", async (event) => {
    try {
      await onGlossaryCreated(event.payload);
    } catch (error) {
      logger
        .withSituation("SERVER")
        .error(error, "Failed to handle glossary:created event");
    }
  });

  domainEventBus.subscribe("memory:created", async (event) => {
    try {
      await onMemoryCreated(event.payload);
    } catch (error) {
      logger
        .withSituation("SERVER")
        .error(error, "Failed to handle memory:created event");
    }
  });

  registered = true;
};
