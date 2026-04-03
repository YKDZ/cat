type MaybePromise<T> = Promise<T> | T;

export type EventMap = Record<string, unknown>;

export type EventOf<M extends EventMap, T extends keyof M & string> = {
  eventId: string;
  type: T;
  payload: M[T];
  timestamp: string;
  traceId?: string;
  causationId?: string;
};

export type AnyEventOf<M extends EventMap> = {
  [K in keyof M & string]: EventOf<M, K>;
}[keyof M & string];

export type EventHandler<TEvent> = (event: TEvent) => MaybePromise<void>;
//          ^^^^^^^^^^^^^ 原名: TypedEventHandler

export type WaitForEventOptions<
  TType extends string,
  TEvent extends { type: TType },
  T extends TType = TType,
> = {
  type: T;
  timeoutMs?: number;
  predicate?: (event: Extract<TEvent, { type: T }>) => boolean;
};

export type EventBus<
  //         ^^^^^^^^ 原名: TypedEventBus
  TType extends string,
  TEvent extends { type: TType },
> = {
  publish: (event: TEvent) => Promise<void>;
  publishMany: (events: TEvent[]) => Promise<void>;
  subscribe: <T extends TType>(
    type: T,
    handler: EventHandler<Extract<TEvent, { type: T }>>,
  ) => () => void;
  subscribeAll: (handler: EventHandler<TEvent>) => () => void;
  waitFor: <T extends TType>(
    options: WaitForEventOptions<TType, TEvent, T>,
  ) => Promise<Extract<TEvent, { type: T }>>;
};

export type CreateEventOptions = {
  eventId?: string;
  timestamp?: string;
  traceId?: string;
  causationId?: string;
};

export class InProcessEventBus<
  TType extends string,
  TEvent extends { type: TType },
> implements EventBus<TType, TEvent> {
  private readonly handlersByType = new Map<TType, Set<EventHandler<TEvent>>>();

  private readonly allHandlers = new Set<EventHandler<TEvent>>();

  publish = async (event: TEvent): Promise<void> => {
    const typeHandlers = this.handlersByType.get(event.type) ?? new Set();
    const tasks = [
      ...Array.from(typeHandlers, async (handler) =>
        Promise.resolve(handler(event)),
      ),
      ...Array.from(this.allHandlers, async (handler) =>
        Promise.resolve(handler(event)),
      ),
    ];

    await Promise.all(tasks);
  };

  publishMany = async (events: TEvent[]): Promise<void> => {
    for (const event of events) {
      // oxlint-disable-next-line no-await-in-loop
      await this.publish(event);
    }
  };

  private readonly isEventOfType = <T extends TType>(
    event: TEvent,
    type: T,
  ): event is Extract<TEvent, { type: T }> => {
    return event.type === type;
  };

  subscribe = <T extends TType>(
    type: T,
    handler: EventHandler<Extract<TEvent, { type: T }>>,
  ): (() => void) => {
    const currentHandlers = this.handlersByType.get(type) ?? new Set();
    const wrappedHandler: EventHandler<TEvent> = async (event) => {
      if (!this.isEventOfType(event, type)) return;
      await handler(event);
    };

    currentHandlers.add(wrappedHandler);
    this.handlersByType.set(type, currentHandlers);

    return () => {
      const handlers = this.handlersByType.get(type);
      if (!handlers) return;
      handlers.delete(wrappedHandler);
      if (handlers.size === 0) {
        this.handlersByType.delete(type);
      }
    };
  };

  subscribeAll = (handler: EventHandler<TEvent>): (() => void) => {
    this.allHandlers.add(handler);

    return () => {
      this.allHandlers.delete(handler);
    };
  };

  waitFor = async <T extends TType>(
    options: WaitForEventOptions<TType, TEvent, T>,
  ): Promise<Extract<TEvent, { type: T }>> => {
    const { type, timeoutMs = 300_000, predicate } = options;

    return new Promise<Extract<TEvent, { type: T }>>((resolve, reject) => {
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

export const createEvent = <M extends EventMap, T extends keyof M & string>(
  type: T,
  payload: M[T],
  options?: CreateEventOptions,
): EventOf<M, T> => ({
  eventId: options?.eventId ?? crypto.randomUUID(),
  type,
  payload,
  timestamp: options?.timestamp ?? new Date().toISOString(),
  ...(options?.traceId ? { traceId: options.traceId } : {}),
  ...(options?.causationId ? { causationId: options.causationId } : {}),
});
