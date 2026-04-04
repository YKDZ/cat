import {
  InProcessEventBus as BaseInProcessEventBus,
  type EventBus,
  type WaitForEventOptions,
} from "@cat/core";

import type { AgentEvent, EventType } from "@/graph/events";

import { createAgentEvent } from "@/graph/events";

export type WaitForEventArgs<T extends EventType = EventType> =
  WaitForEventOptions<EventType, AgentEvent, T>;

export type AgentEventBus = EventBus<EventType, AgentEvent>;

export class InProcessEventBus implements AgentEventBus {
  private readonly bus = new BaseInProcessEventBus<EventType, AgentEvent>();

  publish: AgentEventBus["publish"] = async (event): Promise<void> => {
    const normalized = createAgentEvent(event);

    await this.bus.publish(normalized);
  };

  publishMany: AgentEventBus["publishMany"] = async (events): Promise<void> => {
    const normalized = events.map((event) => createAgentEvent(event));

    await this.bus.publishMany(normalized);
  };

  subscribe: AgentEventBus["subscribe"] = (eventType, handler) => {
    return this.bus.subscribe(eventType, handler);
  };

  subscribeAll: AgentEventBus["subscribeAll"] = (handler) => {
    return this.bus.subscribeAll(handler);
  };

  waitFor: AgentEventBus["waitFor"] = async (options) => {
    return this.bus.waitFor(options);
  };
}
