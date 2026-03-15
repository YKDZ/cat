import type { DomainEvent, DomainEventType } from "@/events/domain-events";

import {
  InProcessEventBus,
  type TypedEventBus,
} from "@/events/typed-event-bus";

export type DomainEventBus = TypedEventBus<DomainEventType, DomainEvent>;

export const domainEventBus: DomainEventBus = new InProcessEventBus<
  DomainEventType,
  DomainEvent
>();
