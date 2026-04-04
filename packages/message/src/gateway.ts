import type { DbHandle } from "@cat/domain";

import { executeQuery, getUserEmail } from "@cat/domain";
import { domainEventBus } from "@cat/domain/events";

import { NotificationConnectionManager } from "@/connection-manager";
import { EmailDispatcher, type EmailProvider } from "@/dispatchers/email";
import { InAppDispatcher } from "@/dispatchers/in-app";
import { MessageRouter } from "@/router";

export type MessageGatewayOptions = {
  db: DbHandle;
  getEmailProvider?: () => EmailProvider | undefined;
};

/**
 * @zh 统一消息网关 — 订阅域事件，串联路由器与实时连接管理。
 * @en Unified message gateway — subscribes to domain events, ties router and connections.
 */
export class MessageGateway {
  readonly router: MessageRouter;
  readonly connections: NotificationConnectionManager;
  private unsubSend: (() => void) | null = null;
  private unsubCreated: (() => void) | null = null;

  constructor(private readonly options: MessageGatewayOptions) {
    this.router = new MessageRouter(options.db);
    this.connections = new NotificationConnectionManager();
    this.router.registerDispatcher(new InAppDispatcher(options.db));
    this.router.registerDispatcher(
      new EmailDispatcher(
        options.getEmailProvider ?? (() => undefined),
        async (userId) => this.resolveUserEmail(userId),
      ),
    );
  }

  /** @zh 启动网关，订阅域事件。 @en Start gateway, subscribe to domain events. */
  start(): void {
    this.unsubSend = domainEventBus.subscribe(
      "message:send-requested",
      async (event) => {
        await this.router.send(event.payload);
      },
    );
    this.unsubCreated = domainEventBus.subscribe(
      "notification:created",
      async (event) => {
        this.connections.pushToUser(event.payload.recipientId, event.payload);
      },
    );
  }

  /** @zh 停止网关，取消订阅。 @en Stop gateway, unsubscribe. */
  stop(): void {
    this.unsubSend?.();
    this.unsubCreated?.();
    this.unsubSend = null;
    this.unsubCreated = null;
  }

  private async resolveUserEmail(userId: string): Promise<string | null> {
    return executeQuery({ db: this.options.db }, getUserEmail, { userId });
  }
}
