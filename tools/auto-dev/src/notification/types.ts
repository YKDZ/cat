import type { NotificationEvent } from "../shared/types.js";

export interface NotificationChannel {
  send(event: NotificationEvent): Promise<void>;
}
