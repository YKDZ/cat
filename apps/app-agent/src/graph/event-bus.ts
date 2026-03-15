import {
  InProcessEventBus as BaseInProcessEventBus,
  type TypedEventBus,
} from "@cat/domain/events";

import type { AgentEvent, AgentEventOf, EventType } from "@/graph/events";

import { createAgentEvent } from "@/graph/events";

export type WaitForEventArgs<T extends EventType = EventType> = {
  type: T;
  timeoutMs?: number;
  predicate?: (event: AgentEventOf<T>) => boolean;
};

export type EventBus = TypedEventBus<EventType, AgentEvent> & {
  waitFor: <T extends EventType>(
    options: WaitForEventArgs<T>,
  ) => Promise<AgentEventOf<T>>;
};

export class InProcessEventBus implements EventBus {
  private readonly bus = new BaseInProcessEventBus<EventType, AgentEvent>();

  publish: EventBus["publish"] = async (event): Promise<void> => {
    const normalized = createAgentEvent(event);

    await this.bus.publish(normalized);
  };

  publishMany: EventBus["publishMany"] = async (events): Promise<void> => {
    const normalized = events.map((event) => createAgentEvent(event));

    await this.bus.publishMany(normalized);
  };

  subscribe = <T extends EventType>(
    eventType: T,
    handler: (event: AgentEventOf<T>) => Promise<void> | void,
  ): (() => void) => {
    return this.bus.subscribe(eventType, handler);
  };

  subscribeAll = (
    handler: (event: AgentEvent) => Promise<void> | void,
  ): (() => void) => {
    return this.bus.subscribeAll(handler);
  };

  waitFor = async <T extends EventType>(
    options: WaitForEventArgs<T>,
  ): Promise<AgentEventOf<T>> => {
    const { type, timeoutMs = 300_000, predicate } = options;

    return new Promise<AgentEventOf<T>>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(
          new Error(`Wait event timeout: type=${type}, timeoutMs=${timeoutMs}`),
        );
      }, timeoutMs);

      const unsubscribe = this.subscribe(type, (event) => {
        if (predicate && !predicate(event)) {
          return;
        }

        clearTimeout(timer);
        unsubscribe();
        resolve(event);
      });
    });
  };
}
