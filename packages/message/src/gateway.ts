import type { DbHandle } from "@cat/domain";
import { executeQuery, getUserEmail } from "@cat/domain";
import { domainEventBus } from "@cat/domain/events";

import { NotificationConnectionManager } from "#/connection-manager.ts";
import { EmailDispatcher, type EmailProvider } from "#/dispatchers/email.ts";
import { InAppDispatcher } from "#/dispatchers/in-app.ts";
import { MessageRouter } from "#/router.ts";

export type MessageGatewayOptions = {
  db: DbHandle;
  getEmailProvider?: () => EmailProvider | undefined;
};

/**
 * Unified message gateway — subscribes to domain events, ties router and connections.
 */
export class MessageGateway {
  readonly router: MessageRouter;
  readonly connections: NotificationConnectionManager;
  private readonly options: MessageGatewayOptions;
  private unsubSend: (() => void) | null = null;
  private unsubCreated: (() => void) | null = null;

  constructor(options: MessageGatewayOptions) {
    this.options = options;
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

  /** Start gateway, subscribe to domain events. */
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

  /** Stop gateway, unsubscribe. */
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
