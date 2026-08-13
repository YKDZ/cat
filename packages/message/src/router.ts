import type { DbHandle } from "@cat/domain";
import { executeQuery, getEnabledChannels } from "@cat/domain";
import { serverLogger } from "@cat/server-shared";
import type { MessageChannel } from "@cat/shared";

import type { ChannelDispatcher, MessageRequest } from "#/types.ts";

/**
 * Unified message router — resolves channels and dispatches concurrently.
 */
export class MessageRouter {
  private readonly dispatchers = new Map<MessageChannel, ChannelDispatcher>();
  private readonly db: DbHandle;

  constructor(db: DbHandle) {
    this.db = db;
  }

  registerDispatcher(dispatcher: ChannelDispatcher): void {
    this.dispatchers.set(dispatcher.channel, dispatcher);
  }

  async send(request: MessageRequest): Promise<void> {
    const channels =
      request.channels ??
      (await executeQuery({ db: this.db }, getEnabledChannels, {
        userId: request.recipientId,
        category: request.category,
      }));
    const tasks = channels
      .map((ch) => this.dispatchers.get(ch))
      .filter((d): d is ChannelDispatcher => d !== undefined)
      .map(async (d) => d.dispatch(request));
    const results = await Promise.allSettled(tasks);
    for (const r of results) {
      if (r.status === "rejected") {
        serverLogger
          .child({ component: "server" })
          .error("Channel dispatch failed", { error: r.reason });
      }
    }
  }
}
