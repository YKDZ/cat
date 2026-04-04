import type { DbHandle } from "@cat/domain";
import type { MessageChannel } from "@cat/shared/schema/enum";

import { executeQuery, getEnabledChannels } from "@cat/domain";
import { serverLogger } from "@cat/server-shared";

import type { ChannelDispatcher, MessageRequest } from "@/types";

/**
 * @zh 统一消息路由器 — 按用户偏好解析渠道并并发分发。
 * @en Unified message router — resolves channels and dispatches concurrently.
 */
export class MessageRouter {
  private readonly dispatchers = new Map<MessageChannel, ChannelDispatcher>();
  constructor(private readonly db: DbHandle) {}

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
          .withSituation("SERVER")
          .error(r.reason, "Channel dispatch failed");
      }
    }
  }
}
