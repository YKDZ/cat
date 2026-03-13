import * as crypto from "node:crypto";

import type { AgentEvent, EventHandler, EventType } from "@/graph/events";
import type { RunId } from "@/graph/types";

import { AgentEventSchema } from "@/graph/events";

export type EventBus = {
  publish: (
    event: Omit<AgentEvent, "eventId"> & { eventId?: string },
  ) => Promise<AgentEvent>;
  subscribe: (eventType: EventType, handler: EventHandler) => () => void;
  subscribeAll: (handler: EventHandler) => () => void;
  waitFor: (args: {
    runId: RunId;
    eventType: EventType;
    timeoutMs?: number;
    predicate?: (event: AgentEvent) => boolean;
  }) => Promise<AgentEvent>;
};

export class InProcessEventBus implements EventBus {
  private handlersByType = new Map<EventType, Set<EventHandler>>();

  private allHandlers = new Set<EventHandler>();

  publish = async (
    eventLike: Omit<AgentEvent, "eventId"> & { eventId?: string },
  ): Promise<AgentEvent> => {
    const event = AgentEventSchema.parse({
      ...eventLike,
      eventId: eventLike.eventId ?? crypto.randomUUID(),
    });

    const handlers = this.handlersByType.get(event.type);
    const tasks: Array<Promise<void>> = [];

    if (handlers && handlers.size > 0) {
      for (const handler of handlers) {
        tasks.push(Promise.resolve(handler(event)));
      }
    }

    if (this.allHandlers.size > 0) {
      for (const handler of this.allHandlers) {
        tasks.push(Promise.resolve(handler(event)));
      }
    }

    await Promise.all(tasks);
    return event;
  };

  subscribe = (eventType: EventType, handler: EventHandler): (() => void) => {
    const current =
      this.handlersByType.get(eventType) ?? new Set<EventHandler>();
    current.add(handler);
    this.handlersByType.set(eventType, current);

    return () => {
      const handlers = this.handlersByType.get(eventType);
      if (!handlers) return;
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlersByType.delete(eventType);
      }
    };
  };

  subscribeAll = (handler: EventHandler): (() => void) => {
    this.allHandlers.add(handler);
    return () => {
      this.allHandlers.delete(handler);
    };
  };

  waitFor = async (args: {
    runId: RunId;
    eventType: EventType;
    timeoutMs?: number;
    predicate?: (event: AgentEvent) => boolean;
  }): Promise<AgentEvent> => {
    const { runId, eventType, timeoutMs = 300_000, predicate } = args;

    const result = await new Promise<AgentEvent>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(
          new Error(
            `Wait event timeout: runId=${runId}, eventType=${eventType}, timeoutMs=${timeoutMs}`,
          ),
        );
      }, timeoutMs);

      const unsubscribe = this.subscribe(eventType, (event) => {
        const matchedRun = event.runId === runId;
        const matchedPredicate = predicate ? predicate(event) : true;
        if (!matchedRun || !matchedPredicate) return;

        clearTimeout(timer);
        unsubscribe();
        resolve(event);
      });
    });

    return result;
  };
}
