import type { DrizzleClient, DrizzleTransaction } from "@cat/db";

import type { DomainEvent } from "@/events/domain-events";

export type DbHandle = DrizzleClient | DrizzleTransaction;

export type DbContext = {
  db: DbHandle;
};

export type { DrizzleClient, DrizzleTransaction } from "@cat/db";
export type { DrizzleDB } from "@cat/db";
export type { RedisConnection } from "@cat/db";

export type CommandResult<R> = {
  result: R;
  events: DomainEvent[];
};

export type Query<Q, R> = (ctx: DbContext, query: Q) => Promise<R>;

export type Command<C, R = void> = (
  ctx: DbContext,
  command: C,
) => Promise<CommandResult<R>>;

/**
 * Cross-cutting context passed through operation chains.
 * Contains a trace ID for distributed tracing, an optional abort signal,
 * and an optional plugin manager instance override.
 */
export type OperationContext = {
  traceId: string;
  signal?: AbortSignal;
  pluginManager?: unknown;
};
