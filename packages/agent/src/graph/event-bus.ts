import {
  InProcessEventBus as BaseInProcessEventBus,
  type TypedEventBus,
  type WaitForEventOptions,
} from "@cat/domain/events";

import type { AgentEvent, EventType } from "@/graph/events";

import { createAgentEvent } from "@/graph/events";

export type WaitForEventArgs<T extends EventType = EventType> =
  WaitForEventOptions<EventType, AgentEvent, T>;

export type EventBus = TypedEventBus<EventType, AgentEvent>;

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

  subscribe: EventBus["subscribe"] = (eventType, handler) => {
    return this.bus.subscribe(eventType, handler);
  };

  subscribeAll: EventBus["subscribeAll"] = (handler) => {
    return this.bus.subscribeAll(handler);
  };

  waitFor: EventBus["waitFor"] = async (options) => {
    return this.bus.waitFor(options);
  };
}
