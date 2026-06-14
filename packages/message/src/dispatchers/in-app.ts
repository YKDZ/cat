import type { DbHandle } from "@cat/domain";

import { createNotification, executeCommand } from "@cat/domain";

import type { ChannelDispatcher, MessageRequest } from "@/types";

/**
 * In-app dispatcher — persists via createNotification command and triggers push.
 */
export class InAppDispatcher implements ChannelDispatcher {
  readonly channel = "IN_APP" as const;
  private readonly db: DbHandle;
  constructor(db: DbHandle) {
    this.db = db;
  }

  async dispatch(request: MessageRequest): Promise<void> {
    await executeCommand({ db: this.db }, createNotification, {
      recipientId: request.recipientId,
      category: request.category,
      title: request.title,
      body: request.body,
      data: request.data,
    });
  }
}
