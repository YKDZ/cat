import type { DomainEventMap } from "@cat/domain/events";

import { AsyncMessageQueue } from "@cat/server-shared";

/** @zh 通知推送载荷。 @en Notification push payload. */
export type NotificationPushPayload = DomainEventMap["notification:created"];

/**
 * @zh 站内信连接管理器 — 管理每用户的 AsyncMessageQueue。
 * @en Notification connection manager — manages per-user AsyncMessageQueue instances.
 */
export class NotificationConnectionManager {
  private readonly connections = new Map<
    string,
    Set<AsyncMessageQueue<NotificationPushPayload>>
  >();

  connect(userId: string): AsyncMessageQueue<NotificationPushPayload> {
    const queue = new AsyncMessageQueue<NotificationPushPayload>();
    const set = this.connections.get(userId) ?? new Set();
    set.add(queue);
    this.connections.set(userId, set);
    return queue;
  }

  disconnect(
    userId: string,
    queue: AsyncMessageQueue<NotificationPushPayload>,
  ): void {
    const set = this.connections.get(userId);
    if (!set) return;
    queue.close();
    queue.clear();
    set.delete(queue);
    if (set.size === 0) this.connections.delete(userId);
  }

  pushToUser(userId: string, payload: NotificationPushPayload): void {
    const set = this.connections.get(userId);
    if (!set) return;
    for (const queue of set) queue.push(payload);
  }
}
