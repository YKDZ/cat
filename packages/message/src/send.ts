import type { MessageCategory, MessageChannel } from "@cat/shared";
import type { JSONType } from "@cat/shared";

import { domainEvent, domainEventBus } from "@cat/domain/events";

/**
 * @zh 从任意后端位置发送消息，发布 message:send-requested 域事件。
 * @en Send a message from anywhere in the backend by publishing message:send-requested.
 */
export const sendMessage = async (options: {
  recipientId: string;
  category: MessageCategory;
  title: string;
  body: string;
  data?: JSONType;
  channels?: MessageChannel[];
}): Promise<void> => {
  await domainEventBus.publish(domainEvent("message:send-requested", options));
};
