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

/**
 * @zh 注册领域事件处理器（全局单例）。
 *
 * 订阅以下领域事件：
 * - `concept:updated` → 触发概念重向量化
 * - `project:created` → 授予创建者 owner 权限
 * - `glossary:created` → 授予创建者 owner 权限
 * - `memory:created` → 授予创建者 owner 权限
 *
 * 具备内置幂等性防护，重复调用不会重复注册。
 * @en Register domain event handlers (global singleton).
 *
 * Subscribes to the following domain events:
 * - `concept:updated` → triggers concept re-vectorization
 * - `project:created` → grants owner permission to the creator
 * - `glossary:created` → grants owner permission to the creator
 * - `memory:created` → grants owner permission to the creator
 *
 * Idempotent: repeated calls are no-ops.
 */
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
