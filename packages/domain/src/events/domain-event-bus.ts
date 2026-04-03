import { InProcessEventBus, type EventBus } from "@cat/core";

import type { DomainEvent, DomainEventType } from "@/events/domain-events";

export type DomainEventBus = EventBus<DomainEventType, DomainEvent>;

export const domainEventBus: DomainEventBus = new InProcessEventBus<
  DomainEventType,
  DomainEvent
>();
