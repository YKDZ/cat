import type { DomainEventBus } from "@/events/domain-event-bus";
import type { DomainEvent } from "@/events/domain-events";

export type EventCollector = {
  collect: (events: DomainEvent[]) => void;
  flush: () => Promise<void>;
};

export const noopCollector: EventCollector = {
  collect: (events) => {
    void events;
  },
  flush: async () => {
    await Promise.resolve();
  },
};

export const createInProcessCollector = (
  bus: DomainEventBus,
): EventCollector => {
  const buffer: DomainEvent[] = [];

  return {
    collect: (events) => {
      buffer.push(...events);
    },
    flush: async () => {
      if (buffer.length === 0) return;

      const eventsToPublish = [...buffer];
      await bus.publishMany(eventsToPublish);
      buffer.length = 0;
    },
  };
};
