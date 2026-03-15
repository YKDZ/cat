import type { DomainEvent } from "@/events/domain-events";
import type { EventCollector } from "@/events/event-collector";
import type { Command, DbHandle, Query } from "@/types";

import { domainEventBus } from "@/events/domain-event-bus";

export type ExecutorContext = {
  db: DbHandle;
  collector?: EventCollector;
  traceId?: string;
};

const withTraceId = (event: DomainEvent, traceId?: string): DomainEvent => {
  if (!traceId) return event;

  return {
    ...event,
    traceId,
  };
};

export const executeCommand = async <C, R>(
  execCtx: ExecutorContext,
  command: Command<C, R>,
  input: C,
): Promise<R> => {
  const { result, events } = await command({ db: execCtx.db }, input);

  if (events.length > 0) {
    const tracedEvents = events.map((event) =>
      withTraceId(event, execCtx.traceId),
    );

    if (execCtx.collector) {
      execCtx.collector.collect(tracedEvents);
    } else {
      await domainEventBus.publishMany(tracedEvents);
    }
  }

  return result;
};

export const executeQuery = async <Q, R>(
  execCtx: Pick<ExecutorContext, "db">,
  query: Query<Q, R>,
  input: Q,
): Promise<R> => {
  return query({ db: execCtx.db }, input);
};
