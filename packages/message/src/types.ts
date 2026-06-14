import type { MessageCategory, MessageChannel } from "@cat/shared";
import type { JSONType } from "@cat/shared";

/** Message send request payload. */
export type MessageRequest = {
  recipientId: string;
  category: MessageCategory;
  title: string;
  body: string;
  data?: JSONType;
  channels?: MessageChannel[];
};

/** Channel dispatcher interface. */
export interface ChannelDispatcher {
  readonly channel: MessageChannel;
  dispatch(request: MessageRequest): Promise<void>;
}
