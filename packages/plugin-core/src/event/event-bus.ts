import type { TranslatableElement } from "@cat/shared";
import type { TranslationSuggestion } from "@cat/shared";

export interface EventMap {
  onRequestSuggestion: {
    args: {
      element: TranslatableElement;
      languageFromId: string;
      languageToId: string;
    };
    suggestions: TranslationSuggestion[];
  };
}

export type EventCallback<K extends keyof EventMap> = (
  payload: EventMap[K],
) => EventMap[K] | Promise<EventMap[K]> | void | Promise<void>;

export class EventBus {
  private static instance: EventBus;
  private events: {
    [K in keyof EventMap]?: EventCallback<K>[];
  } = {};

  private constructor() {}

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  subscribe<K extends keyof EventMap>(event: K, callback: EventCallback<K>) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event]!.push(callback);
  }

  async emit<K extends keyof EventMap>(
    event: K,
    initialPayload: EventMap[K],
  ): Promise<EventMap[K]> {
    let currentPayload = initialPayload;
    const callbacks = this.events[event] || [];

    for (const cb of callbacks) {
      const result = await cb(currentPayload);
      if (result !== undefined && result !== null) {
        if (typeof result === "object") {
          currentPayload = { ...result };
        } else {
          currentPayload = result;
        }
      }
    }

    return currentPayload;
  }
}
